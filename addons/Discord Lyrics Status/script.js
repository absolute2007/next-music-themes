(() => {
  'use strict';

  // Teardown previous instance if reloading
  if (window.__discordLyricsAddon?.dispose) {
    try { window.__discordLyricsAddon.dispose(); } catch (e) {}
  }

  const STORAGE_KEYS = {
    token: 'nmc_discord_lyrics_token',
    crashRestore: 'nmc_lyrics_active_session_status'
  };


  const CONFIG = {
    minIntervalMs: 250,       // Без задержки между сменами строк
    maxTextLength: 128,       // Макс. длина статуса в Discord
    leadTimeSec: 0.15,        // Упреждение для синхрона
    lineEndGraceSec: 4.5,     // Время показа строки, если следующая ещё нескоро
    lyricTtlSafetySec: 10     // Fail-safe: сервер Discord сам удаляет строку караоке при краше
  };

  let isDisposed = false;
  let userStatusBeforeLyrics = null;
  let isStatusOverridden = false;
  let isCapturingStatus = false;
  let isRecoveringCrash = true;
  let currentLyrics = [];
  let currentTrackKey = null;
  let lyricsLoadedForKey = null;
  let lastSentLyricsLine = null;
  let lastSentAt = 0;
  let isUpdating = false;
  let isRateLimitedUntil = 0;

  // DOM Elements cache
  let modalOverlayEl = null;

  // Токен пользователя хранится только локально, в localStorage клиента.
  // В коде аддона токена нет: без него аддон ничего не отправляет в Discord.
  function getDiscordToken() {
    try {
      const custom = localStorage.getItem(STORAGE_KEYS.token);
      if (custom && custom.trim().length > 10) return custom.trim();
    } catch {}
    return '';
  }

  function setDiscordToken(token) {
    try {
      if (token && token.trim()) {
        localStorage.setItem(STORAGE_KEYS.token, token.trim());
      } else {
        localStorage.removeItem(STORAGE_KEYS.token);
      }
    } catch {}
  }

  // Проверка: является ли текст строкой из песни
  function isTextFromLyrics(text) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (lastSentLyricsLine && trimmed === lastSentLyricsLine.trim()) return true;
    if (Array.isArray(currentLyrics)) {
      for (const line of currentLyrics) {
        if (line.text && line.text.trim() === trimmed) return true;
      }
    }
    return false;
  }

  // Проверка токена через Discord API
  async function validateDiscordToken(tokenToTest) {
    try {
      const res = await fetch('https://discord.com/api/v9/users/@me', {
        headers: {
          'Authorization': tokenToTest,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const user = await res.json();
        return { valid: true, user };
      }
    } catch (e) {
      return { valid: false, error: e.message };
    }
    return { valid: false };
  }

  // Получение актуального статуса из Discord
  async function fetchDiscordCustomStatus() {
    const token = getDiscordToken();
    if (!token) return null;
    try {
      const res = await fetch('https://discord.com/api/v9/users/@me/settings', {
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        return data.custom_status || null;
      }
    } catch (e) {
      console.warn('[DiscordLyrics] Failed to fetch current Discord status:', e);
    }
    return null;
  }

  // Отправка статуса в Discord API
  async function patchDiscordStatus(statusObj, isKeepalive = false) {
    if (!getDiscordToken()) return false;
    if (Date.now() < isRateLimitedUntil) return false;

    while (isUpdating) {
      await new Promise(r => setTimeout(r, 20));
    }
    isUpdating = true;

    const token = getDiscordToken();
    try {
      const payload = {
        custom_status: statusObj ? {
          text: statusObj.text ?? '',
          emoji_name: statusObj.emoji_name ?? null,
          emoji_id: statusObj.emoji_id ?? null,
          expires_at: statusObj.expires_at ?? null
        } : null
      };

      const res = await fetch('https://discord.com/api/v9/users/@me/settings', {
        method: 'PATCH',
        keepalive: isKeepalive,
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      lastSentAt = Date.now();

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        const retryAfter = (data.retry_after || 2) * 1000;
        isRateLimitedUntil = Date.now() + retryAfter;
        console.warn(`[DiscordLyrics] Rate limited by Discord. Waiting ${retryAfter}ms`);
        return false;
      }
      return res.ok;
    } catch (e) {
      console.error('[DiscordLyrics] Network error sending status:', e);
      return false;
    } finally {
      isUpdating = false;
    }
  }

  // Восстановление статуса после краша/перезагрузки прошлой сессии
  async function checkCrashRecovery() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.crashRestore);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.status !== undefined) {
          console.log('[DiscordLyrics] Restoring saved user status on startup:', parsed.status?.text || '(empty)');
          localStorage.removeItem(STORAGE_KEYS.crashRestore);
          userStatusBeforeLyrics = parsed.status;
          await patchDiscordStatus(parsed.status, true);
        }
      }
    } catch (e) {
      console.warn('[DiscordLyrics] Crash recovery error:', e);
    } finally {
      isRecoveringCrash = false;
    }
  }

  // Возврат личного статуса пользователя
  async function restoreUserStatus() {
    if (!isStatusOverridden) return;
    const statusToRestore = userStatusBeforeLyrics;
    console.log('[DiscordLyrics] Restoring user status:', statusToRestore?.text || '(empty)');

    isStatusOverridden = false;
    lastSentLyricsLine = null;
    try {
      localStorage.removeItem(STORAGE_KEYS.crashRestore);
    } catch {}

    const cleanUserStatus = statusToRestore ? {
      text: statusToRestore.text ?? '',
      emoji_name: statusToRestore.emoji_name ?? null,
      emoji_id: statusToRestore.emoji_id ?? null,
      expires_at: null
    } : null;

    await patchDiscordStatus(cleanUserStatus, true);
    userStatusBeforeLyrics = null;
  }

  // Синхронный возврат при выходе/закрытии окна
  function sendSyncRestore() {
    if (!isStatusOverridden) return;
    const statusToRestore = userStatusBeforeLyrics;
    isStatusOverridden = false;
    lastSentLyricsLine = null;
    try {
      localStorage.removeItem(STORAGE_KEYS.crashRestore);
    } catch {}

    try {
      const payload = JSON.stringify({
        custom_status: statusToRestore ? {
          text: statusToRestore.text ?? '',
          emoji_name: statusToRestore.emoji_name ?? null,
          emoji_id: statusToRestore.emoji_id ?? null,
          expires_at: null
        } : null
      });

      const xhr = new XMLHttpRequest();
      xhr.open('PATCH', 'https://discord.com/api/v9/users/@me/settings', false);
      xhr.setRequestHeader('Authorization', getDiscordToken());
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(payload);
      console.log('[DiscordLyrics] Sync restore executed on close');
    } catch (e) {
      console.error('[DiscordLyrics] Sync restore failed on exit:', e);
    }
  }

  // Установка строки караоке в статус с fail-safe TTL
  async function setLyricsStatus(lineText, lineTtlSec = CONFIG.lyricTtlSafetySec) {
    if (!lineText) {
      await restoreUserStatus();
      return;
    }

    const now = Date.now();

    // ПЕРЕД первой строчкой трека один раз захватываем исходный статус пользователя
    if (!isStatusOverridden) {
      if (isCapturingStatus) return;
      isCapturingStatus = true;
      try {
        let current = await fetchDiscordCustomStatus();
        if (current && isTextFromLyrics(current.text)) {
          console.warn('[DiscordLyrics] Captured status was an active lyric line! Falling back to cache.');
          const saved = localStorage.getItem(STORAGE_KEYS.crashRestore);
          if (saved) {
            try {
              current = JSON.parse(saved).status || null;
            } catch {
              current = null;
            }
          } else {
            current = null;
          }
        }

        userStatusBeforeLyrics = current;
        isStatusOverridden = true;
        try {
          localStorage.setItem(STORAGE_KEYS.crashRestore, JSON.stringify({ status: current, savedAt: Date.now() }));
        } catch {}
        console.log('[DiscordLyrics] Captured user status before track:', current?.text || '(empty)');
      } finally {
        isCapturingStatus = false;
      }
    }

    if (lineText === lastSentLyricsLine) {
      if (now - lastSentAt < 4000) return;
    } else {
      if (now - lastSentAt < CONFIG.minIntervalMs) return;
    }

    lastSentLyricsLine = lineText;

    // Fail-safe TTL: при внезапном падении Discord сам очистит строку
    const effectiveTtl = Math.max(6, Math.min(25, Math.ceil(lineTtlSec + 2)));
    const expiresAt = new Date(now + effectiveTtl * 1000).toISOString();

    await patchDiscordStatus({
      text: lineText,
      emoji_name: null,
      emoji_id: null,
      expires_at: expiresAt
    });
  }

  // Парсинг текста формата LRC
  function parseLrc(lrcText) {
    if (!lrcText || typeof lrcText !== 'string') return [];
    const lines = [];
    const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/g;
    let match;
    while ((match = regex.exec(lrcText)) !== null) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      const time = mins * 60 + secs + ms / 1000;
      const text = match[4].trim();
      lines.push({ time, text });
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  function notifyUser(msg, isError = false) {
    try {
      const api = window.nextmusicApi;
      if (!api) return;
      if (isError && typeof api.showErrorToast === 'function') {
        api.showErrorToast(msg);
      } else if (typeof api.showToast === 'function') {
        api.showToast(msg);
      } else if (typeof api.toast === 'function') {
        api.toast(msg);
      }
    } catch (e) {
      console.warn('[DiscordLyrics] Toast error:', e);
    }
  }

  // Быстрый fetch с жестким таймаутом, чтобы зависшие запросы не тормозили плеер
  async function fetchJsonWithTimeout(url, timeoutMs = 3500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Next-Music-Client': 'Next Music/3.17.2' }
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  // Параллельный и умный поиск текста через LRCLIB
  async function fetchLrcFromLrclib(title, artist) {
    if (!title) return null;

    // Очищаем название от меток (feat, ft, remaster), которые часто ломают точный поиск
    const cleanTitle = title
      .replace(/\s*[\(\[](?:feat|ft)\.?\s+[^\)\]]+[\)\]]/gi, '')
      .replace(/\s*[\(\[](?:remastered|remaster|\d{4}\s+remaster)[^\)\]]*[\)\]]/gi, '')
      .trim();
    const primaryArtist = artist ? artist.split(/[,&]/)[0].trim() : '';

    const requests = [];

    // 1. Точный запрос с очищенными данными
    if (cleanTitle && primaryArtist) {
      requests.push(
        fetchJsonWithTimeout(`https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(primaryArtist)}`, 3000)
          .then(data => data?.syncedLyrics || null)
      );
    }

    // 2. Если исходное название отличается — точный запрос оригинала
    if (title !== cleanTitle && artist) {
      requests.push(
        fetchJsonWithTimeout(`https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`, 3000)
          .then(data => data?.syncedLyrics || null)
      );
    }

    // 3. Параллельный поиск по артисту и треку
    if (primaryArtist && cleanTitle) {
      requests.push(
        fetchJsonWithTimeout(`https://lrclib.net/api/search?q=${encodeURIComponent(`${primaryArtist} ${cleanTitle}`)}`, 3500)
          .then(data => (Array.isArray(data) ? data.find(item => item.syncedLyrics)?.syncedLyrics : null))
      );
    }

    // Параллельное ожидание: проверяем первый успешный
    const results = await Promise.allSettled(requests);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        return r.value;
      }
    }

    // 4. Фолбэк чисто по названию, если ничего не нашлось
    if (cleanTitle) {
      const searchRes = await fetchJsonWithTimeout(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`, 3000);
      if (Array.isArray(searchRes)) {
        const found = searchRes.find(item => item.syncedLyrics)?.syncedLyrics;
        if (found) return found;
      }
    }

    return null;
  }

  // Загрузка текста трека
  async function loadLyricsForTrack(key, trackId, title, artist) {
    if (!title) {
      currentLyrics = [];
      lyricsLoadedForKey = key;
      await restoreUserStatus();
      return;
    }

    // 1. Проверяем кэш встроенного парсера Next Music
    if (trackId && window.__ymlrc?.lrclibCache?.has(trackId)) {
      const cached = window.__ymlrc.lrclibCache.get(trackId);
      if (cached) {
        currentLyrics = parseLrc(cached);
        if (currentLyrics.some(l => l.text)) {
          lyricsLoadedForKey = key;
          const count = currentLyrics.filter(l => l.text).length;
          console.log(`[DiscordLyrics] Loaded from cache: ${count} lines`);
          notifyUser(`Текст найден (${count} строк)`);
          return;
        }
      }
    }

    try {
      // 2. Быстрый параллельный поиск с жестким таймаутом
      const lrc = await fetchLrcFromLrclib(title, artist);

      if (lrc) {
        currentLyrics = parseLrc(lrc);
        const count = currentLyrics.filter(l => l.text).length;
        console.log(`[DiscordLyrics] Fetched lyrics for "${title}": ${count} lines`);
        notifyUser(`Текст найден (${count} строк)`);
      } else {
        // Проверяем, не подтянул ли встроенный модуль Next Music текст пока мы искали
        if (trackId && window.__ymlrc?.lrclibCache?.has(trackId)) {
          const cached = window.__ymlrc.lrclibCache.get(trackId);
          if (cached) {
            currentLyrics = parseLrc(cached);
            const count = currentLyrics.filter(l => l.text).length;
            notifyUser(`Текст найден (${count} строк)`);
            return;
          }
        }

        currentLyrics = [];
        console.log(`[DiscordLyrics] No synced lyrics for "${title}"`);
        notifyUser('Текст песни не найден', true);
        await restoreUserStatus();
      }
    } catch (e) {
      console.warn('[DiscordLyrics] Failed to fetch lyrics:', e);
      currentLyrics = [];
      await restoreUserStatus();
    } finally {
      lyricsLoadedForKey = key;
    }
  }

  // Монотонный таймер позиции аудио без прыжков
  let lastRawPosition = 0;
  let lastMonotonicTime = 0;
  let lastSampleAt = 0;

  function getAudioCurrentTime(isPlaying) {
    const api = window.nextmusicApi;
    let raw = null;

    try {
      const audios = Array.from(document.querySelectorAll('audio'));
      const playing = audios.find(a => !a.paused && a.currentTime > 0);
      if (playing) raw = playing.currentTime;
    } catch {}

    if (raw == null) {
      const apiTime = api?.getAudioTime?.();
      if (typeof apiTime === 'number' && apiTime > 0) raw = apiTime;
    }

    if (raw == null) {
      const state = api?.getState?.();
      if (typeof state?.progress === 'number' && state.progress > 0) raw = state.progress;
      else if (typeof state?.progress?.position === 'number' && state.progress.position > 0) raw = state.progress.position;
    }

    const now = Date.now();
    if (raw == null) raw = 0;

    if (!isPlaying) {
      lastRawPosition = raw;
      lastMonotonicTime = raw;
      lastSampleAt = now;
      return raw;
    }

    if (Math.abs(raw - lastRawPosition) > 1.5) {
      lastRawPosition = raw;
      lastMonotonicTime = raw;
      lastSampleAt = now;
      return raw;
    }

    if (raw !== lastRawPosition) {
      lastRawPosition = raw;
      lastMonotonicTime = raw;
      lastSampleAt = now;
    } else {
      const delta = (now - lastSampleAt) / 1000;
      if (delta > 0 && delta < 0.5) {
        lastMonotonicTime += delta;
        lastSampleAt = now;
      }
    }

    return lastMonotonicTime;
  }

  function getPlaybackInfo() {
    const api = window.nextmusicApi;
    if (!api) return null;

    const track = api.getCurrentTrack();
    const state = api.getState();
    if (!track || !state) return null;

    const rawStatus = state.status?.value ?? state.status ?? '';
    const statusStr = String(rawStatus).toLowerCase();
    const isPlaying = statusStr === 'playing' || statusStr === 'play';

    const title = track.title ?? '';
    let artist = '';
    if (Array.isArray(track.artistNames) && track.artistNames.length > 0) {
      artist = track.artistNames.join(', ');
    } else if (Array.isArray(track.artists) && track.artists.length > 0) {
      artist = track.artists.map(a => typeof a === 'string' ? a : (a?.name || '')).filter(Boolean).join(', ');
    }

    const trackKey = `${title}__${artist}`;
    const rawTrackId = track.id || track.realId || null;
    const position = getAudioCurrentTime(isPlaying);

    return {
      trackKey,
      trackId: rawTrackId ? String(rawTrackId) : null,
      title,
      artist,
      position,
      isPlaying
    };
  }

  // Основной цикл
  function tick() {
    if (isRecoveringCrash || isDisposed) return;
    if (!getDiscordToken()) return;

    const info = getPlaybackInfo();
    if (!info) return;

    // Смена трека
    if (info.trackKey !== currentTrackKey) {
      if (isStatusOverridden) {
        restoreUserStatus();
      }
      currentTrackKey = info.trackKey;
      currentLyrics = [];
      lyricsLoadedForKey = null;
      loadLyricsForTrack(info.trackKey, info.trackId, info.title, info.artist);
    }

    if (lyricsLoadedForKey !== info.trackKey) return;

    if (!info.isPlaying) {
      if (isStatusOverridden) restoreUserStatus();
      return;
    }

    if (!currentLyrics.length) {
      if (isStatusOverridden) restoreUserStatus();
      return;
    }

    const effectiveTime = info.position + CONFIG.leadTimeSec;

    let activeIndex = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (currentLyrics[i].time <= effectiveTime) {
        activeIndex = i;
      } else {
        break;
      }
    }

    // 1. До первого вокала
    if (activeIndex === -1) {
      if (isStatusOverridden) restoreUserStatus();
      return;
    }

    const activeLine = currentLyrics[activeIndex];
    const nextLine = currentLyrics[activeIndex + 1];
    let text = activeLine.text ? activeLine.text.trim() : '';

    if (!text) {
      if (isStatusOverridden) restoreUserStatus();
      return;
    }

    const timeSinceStart = effectiveTime - activeLine.time;
    const timeUntilNext = nextLine ? (nextLine.time - effectiveTime) : Infinity;

    // 2. Инструментальная пауза
    if (timeSinceStart > CONFIG.lineEndGraceSec && timeUntilNext > 2.5) {
      if (isStatusOverridden) restoreUserStatus();
      return;
    }

    // 3. Последняя строка спета
    if (!nextLine && timeSinceStart > 5.0) {
      if (isStatusOverridden) restoreUserStatus();
      return;
    }

    if (text.length > CONFIG.maxTextLength) {
      text = text.slice(0, CONFIG.maxTextLength - 3) + '...';
    }

    const lineDuration = nextLine ? Math.max(4, nextLine.time - activeLine.time) : 8;
    setLyricsStatus(text, lineDuration);
  }

  // --- UI: Индикатор и модальное окно настроек ---

  function injectSettingsStyles() {
    if (document.getElementById('nm-discord-lyrics-styles')) return;
    const style = document.createElement('style');
    style.id = 'nm-discord-lyrics-styles';
    style.textContent = `
      .nm-dlyrics-btn-trackbar {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 32px !important;
        height: 32px !important;
        min-width: 32px !important;
        min-height: 32px !important;
        padding: 0 !important;
        margin: 0 4px !important;
        border: none !important;
        background: transparent !important;
        color: rgba(255, 255, 255, 0.7) !important;
        border-radius: 50% !important;
        cursor: pointer !important;
        user-select: none !important;
        transition: color 0.15s ease, background-color 0.15s ease, transform 0.1s ease !important;
        position: relative !important;
        z-index: 1000 !important;
        pointer-events: auto !important;
        -webkit-app-region: no-drag !important;
        app-region: no-drag !important;
        outline: none !important;
        flex-shrink: 0 !important;
        box-sizing: border-box !important;
      }
      .nm-dlyrics-btn-trackbar:hover {
        color: #ffffff !important;
        background: rgba(255, 255, 255, 0.1) !important;
      }
      .nm-dlyrics-btn-trackbar:active {
        transform: scale(0.92) !important;
      }
      .nm-dlyrics-btn-trackbar svg {
        width: 20px !important;
        height: 20px !important;
        display: block !important;
        pointer-events: none !important;
        fill: currentColor !important;
      }
      .nm-dlyrics-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(6px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      .nm-dlyrics-modal-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }
      .nm-dlyrics-modal {
        background: #141416;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        width: 500px;
        max-width: 90vw;
        padding: 24px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        color: #ffffff;
        font-family: inherit;
      }
      .nm-dlyrics-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      .nm-dlyrics-modal-title {
        font-size: 17px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .nm-dlyrics-modal-close {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        line-height: 1;
      }
      .nm-dlyrics-modal-close:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.08);
      }
      .nm-dlyrics-desc {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.5;
        margin-bottom: 16px;
      }
      .nm-dlyrics-steps {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 14px;
        margin-bottom: 18px;
        font-size: 12.5px;
        color: rgba(255, 255, 255, 0.8);
        line-height: 1.6;
      }
      .nm-dlyrics-steps ol {
        margin: 6px 0 0 16px;
        padding: 0;
      }
      .nm-dlyrics-steps li {
        margin-bottom: 6px;
      }
      .nm-dlyrics-code-block {
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(0, 0, 0, 0.5);
        border: 1px solid rgba(88, 101, 242, 0.3);
        border-radius: 6px;
        padding: 6px 10px;
        margin: 6px 0;
        font-family: monospace;
        font-size: 11px;
        color: #949cf7;
        word-break: break-all;
      }
      .nm-dlyrics-copy-btn {
        background: rgba(88, 101, 242, 0.25);
        border: none;
        color: #fff;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
        margin-left: 8px;
      }
      .nm-dlyrics-copy-btn:hover {
        background: #5865f2;
      }
      .nm-dlyrics-field {
        margin-bottom: 16px;
      }
      .nm-dlyrics-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
        margin-bottom: 6px;
      }
      .nm-dlyrics-input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 10px 12px;
        color: #ffffff;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
        font-family: monospace;
      }
      .nm-dlyrics-input:focus {
        border-color: #5865f2;
      }
      .nm-dlyrics-status {
        font-size: 12px;
        margin-bottom: 16px;
        min-height: 18px;
        transition: color 0.2s;
      }
      .nm-dlyrics-status.ok { color: #4ade80; }
      .nm-dlyrics-status.err { color: #f87171; }
      .nm-dlyrics-status.loading { color: #94a3b8; }
      .nm-dlyrics-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .nm-dlyrics-btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.15s ease;
      }
      .nm-dlyrics-btn-cancel {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.8);
      }
      .nm-dlyrics-btn-cancel:hover {
        background: rgba(255, 255, 255, 0.14);
        color: #fff;
      }
      .nm-dlyrics-btn-save {
        background: #5865f2;
        color: #ffffff;
      }
      .nm-dlyrics-btn-save:hover {
        background: #4752c4;
      }
    `;
    document.head.appendChild(style);
  }

  function createModal() {
    if (modalOverlayEl) return;

    modalOverlayEl = document.createElement('div');
    modalOverlayEl.className = 'nm-dlyrics-modal-overlay';
    modalOverlayEl.innerHTML = `
      <div class="nm-dlyrics-modal">
        <div class="nm-dlyrics-modal-header">
          <div class="nm-dlyrics-modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5865f2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            Discord Lyrics Status
          </div>
          <button class="nm-dlyrics-modal-close" title="Закрыть">&times;</button>
        </div>
        <div class="nm-dlyrics-desc">
          Синхронизация текста песни в реальном времени в статус твоего личного Discord-профиля.
        </div>
        <div class="nm-dlyrics-steps">
          <strong>Как скопировать токен:</strong>
          <ol>
            <li>В приложении Discord с Vencord нажми <code>Ctrl + Shift + I</code>.</li>
            <li>Открой вкладку <strong>Console</strong> (Консоль).</li>
            <li>Вставь эту команду и нажми Enter:
              <div class="nm-dlyrics-code-block">
                <span id="nm-dlyrics-cmd-text">Vencord.Webpack.findByProps("getToken").getToken()</span>
                <button class="nm-dlyrics-copy-btn" id="nm-dlyrics-copy-cmd">Копировать</button>
              </div>
              <div style="font-size: 11px; color: rgba(255,255,255,0.45); margin-top: 4px;">
                В консоли сразу появится твой токен в кавычках (например <code>'NTcyNz...'</code>).
              </div>
            </li>
            <li>Скопируй полученный токен (без кавычек), вставь в поле ниже и нажми «Проверить и сохранить».</li>
          </ol>
        </div>
        <div class="nm-dlyrics-field">
          <label class="nm-dlyrics-label" for="nm-dlyrics-token-input">Discord User Token</label>
          <input type="password" id="nm-dlyrics-token-input" class="nm-dlyrics-input" placeholder="Вставь свой Discord токен..." autocomplete="off" />
        </div>
        <div class="nm-dlyrics-status" id="nm-dlyrics-status-box"></div>
        <div class="nm-dlyrics-footer">
          <button class="nm-dlyrics-btn nm-dlyrics-btn-cancel" id="nm-dlyrics-btn-cancel">Отмена</button>
          <button class="nm-dlyrics-btn nm-dlyrics-btn-save" id="nm-dlyrics-btn-save">Проверить и сохранить</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlayEl);

    const closeBtn = modalOverlayEl.querySelector('.nm-dlyrics-modal-close');
    const cancelBtn = modalOverlayEl.querySelector('#nm-dlyrics-btn-cancel');
    const saveBtn = modalOverlayEl.querySelector('#nm-dlyrics-btn-save');
    const copyCmdBtn = modalOverlayEl.querySelector('#nm-dlyrics-copy-cmd');
    const input = modalOverlayEl.querySelector('#nm-dlyrics-token-input');
    const statusBox = modalOverlayEl.querySelector('#nm-dlyrics-status-box');

    const closeModal = () => modalOverlayEl.classList.remove('open');

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modalOverlayEl.addEventListener('click', (e) => {
      if (e.target === modalOverlayEl) closeModal();
    });

    copyCmdBtn.addEventListener('click', () => {
      const cmd = 'Vencord.Webpack.findByProps("getToken").getToken()';
      navigator.clipboard.writeText(cmd).then(() => {
        copyCmdBtn.textContent = 'Скопировано!';
        setTimeout(() => copyCmdBtn.textContent = 'Копировать', 1500);
      });
    });

    saveBtn.addEventListener('click', async () => {
      const val = input.value.trim();
      if (!val) {
        setDiscordToken(null);
        statusBox.className = 'nm-dlyrics-status ok';
        statusBox.textContent = 'Используется токен по умолчанию.';
        setTimeout(closeModal, 800);
        return;
      }

      statusBox.className = 'nm-dlyrics-status loading';
      statusBox.textContent = 'Проверка токена в Discord API...';

      const check = await validateDiscordToken(val);
      if (check.valid) {
        setDiscordToken(val);
        statusBox.className = 'nm-dlyrics-status ok';
        statusBox.textContent = `Успешно! Авторизован как: ${check.user.username || 'Пользователь'}`;
        notifyUser(`Discord подключен (${check.user.username})`);
        setTimeout(closeModal, 1200);
      } else {
        statusBox.className = 'nm-dlyrics-status err';
        statusBox.textContent = 'Ошибка: токен недействителен (401 Unauthorized)';
      }
    });
  }

  function openSettingsModal() {
    createModal();
    const input = modalOverlayEl.querySelector('#nm-dlyrics-token-input');
    const statusBox = modalOverlayEl.querySelector('#nm-dlyrics-status-box');
    const curToken = getDiscordToken();

    input.value = curToken;
    statusBox.textContent = '';
    statusBox.className = 'nm-dlyrics-status';

    modalOverlayEl.classList.add('open');
    input.focus();
    input.select();
  }

  // Встраивание кнопки настроек в панель действий плеера (среди иконок субтитров, очереди и звука)
  function injectBadgeButton() {
    // Удаляем устаревший бейдж, если он остался в DOM
    const oldBadge = document.getElementById('nm-dlyrics-badge-btn');
    if (oldBadge) oldBadge.remove();

    if (document.getElementById('nm-dlyrics-btn')) return;

    // Ищем панель действий в правой части трекбара
    let actions = document.querySelector('[class*="PlayerBarDesktopWithBackgroundProgressBar_actions"]') ||
                  document.querySelector('[class*="PlayerBarDesktop_actions"]') ||
                  document.querySelector('[class*="PlayerBar_actions"]') ||
                  document.querySelector('[class*="PlayerControls_actions"]');

    const volumeEl = document.querySelector('[class*="Volume"], [class*="volume"]');
    if (!actions && volumeEl) {
      actions = volumeEl.closest('[class*="actions"]') || volumeEl.parentElement;
    }

    if (!actions) {
      actions = document.querySelector('[class*="PlayerBarDesktopWithBackgroundProgressBar_root"]') ||
                document.querySelector('[class*="PlayerBarDesktop_root"]') ||
                document.querySelector('[class*="PlayerBar_root"]') ||
                document.querySelector('[class*="PlayerControls_root"]');
    }

    if (!actions) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'nm-dlyrics-btn';
    btn.className = 'nm-dlyrics-btn-trackbar';
    btn.title = 'Настройки Discord Lyrics Status';
    btn.setAttribute('aria-label', 'Настройки Discord Lyrics Status');

    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
      </svg>
    `;

    // Защита от перехвата и потери клика (ловим на capture-фазе mousedown, pointerdown и click)
    let lastOpen = 0;
    const trigger = (e) => {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      const now = Date.now();
      if (now - lastOpen < 350) return;
      lastOpen = now;
      openSettingsModal();
    };

    btn.addEventListener('mousedown', trigger, true);
    btn.addEventListener('pointerdown', trigger, true);
    btn.addEventListener('click', trigger, true);

    // Ищем прямой дочерний элемент actions, содержащий громкость, чтобы встать перед ним
    let refChild = null;
    const vol = actions.querySelector('[class*="Volume"], [class*="volume"]') || volumeEl;
    if (vol && actions.contains(vol)) {
      let curr = vol;
      while (curr && curr.parentElement && curr.parentElement !== actions) {
        curr = curr.parentElement;
      }
      if (curr && curr.parentElement === actions) {
        refChild = curr;
      }
    }

    try {
      if (refChild) {
        actions.insertBefore(btn, refChild);
      } else {
        actions.appendChild(btn);
      }
    } catch (err) {
      actions.appendChild(btn);
    }
  }

  async function init() {
    injectSettingsStyles();
    await checkCrashRecovery();
    setInterval(tick, 100);
    setInterval(injectBadgeButton, 1000);

    window.addEventListener('beforeunload', sendSyncRestore);
    window.addEventListener('unload', sendSyncRestore);

    window.__discordLyricsAddon = {
      openSettings: openSettingsModal,
      dispose: () => {
        isDisposed = true;
        document.getElementById('nm-discord-lyrics-styles')?.remove();
        document.getElementById('nm-dlyrics-btn')?.remove();
        document.getElementById('nm-dlyrics-badge-btn')?.remove();
        modalOverlayEl?.remove();
      }
    };

    console.log('[DiscordLyrics] Addon ready');

    // Первый запуск: токена ещё нет — сразу показываем окно, куда его вставить
    if (!getDiscordToken()) setTimeout(openSettingsModal, 1500);
  }

  if (window.nextmusicApi) {
    init();
  } else {
    const checkTimer = setInterval(() => {
      if (window.nextmusicApi) {
        clearInterval(checkTimer);
        init();
      }
    }, 150);
  }
})();

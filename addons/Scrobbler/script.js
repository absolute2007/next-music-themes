(() => {
  'use strict';

  // Teardown previous instance if reloading
  if (window.__scrobblerAddon?.dispose) {
    try { window.__scrobblerAddon.dispose(); } catch (e) {}
  }

  const STORAGE_KEY = 'nmc_scrobbler_settings';
  const QUEUE_KEY = 'nmc_scrobbler_queue';

  const CONFIG = {
    tickMs: 1000,
    minTrackSec: 30,          // Короче 30 секунд не скробблим
    maxThresholdSec: 240,     // ...скробблим после половины трека или 4 минут
    nowPlayingAfterSec: 3,    // "Сейчас играет" отправляем после пары секунд, чтобы не слать на пропусках
    flushIntervalMs: 60000,   // Повтор отправки очереди, если не было сети
    batchSize: 50
  };

  const LB_API = 'https://api.listenbrainz.org/1/';

  let isDisposed = false;
  let modalOverlayEl = null;
  let current = null;
  let lastTickAt = Date.now();
  let flushing = false;
  const timers = [];

  // --- Хранилище. Ключи и токены живут только в localStorage клиента ---

  function loadSettings() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { listenbrainz: { token: '', username: '', ...(raw.listenbrainz || {}) } };
    } catch {
      return { listenbrainz: { token: '', username: '' } };
    }
  }

  function saveSettings(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }

  function loadQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}');
      return { listenbrainz: Array.isArray(q.listenbrainz) ? q.listenbrainz : [] };
    } catch {
      return { listenbrainz: [] };
    }
  }

  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
  }

  const isLbConnected = (s = loadSettings()) => !!s.listenbrainz.token;

  function notifyUser(msg, isError = false) {
    try {
      const api = window.nextmusicApi;
      if (!api) return;
      if (isError && typeof api.showErrorToast === 'function') api.showErrorToast(msg);
      else if (typeof api.showToast === 'function') api.showToast(msg);
      else if (typeof api.toast === 'function') api.toast(msg);
    } catch (e) {
      console.warn('[Scrobbler] Toast error:', e);
    }
  }

  class ServiceError extends Error {
    constructor(message, { retry = false, auth = false } = {}) {
      super(message);
      this.retry = retry;
      this.auth = auth;
    }
  }

  // --- ListenBrainz ---

  async function lbRequest(path, { method = 'GET', body = null, token }) {
    let res;
    try {
      res = await fetch(LB_API + path, {
        method,
        headers: {
          'Authorization': `Token ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new ServiceError('Нет связи с ListenBrainz', { retry: true });
    }

    const data = await res.json().catch(() => null);
    if (res.status === 401) throw new ServiceError('ListenBrainz: токен недействителен', { auth: true });
    if (res.status === 429 || res.status >= 500) throw new ServiceError(`ListenBrainz: HTTP ${res.status}`, { retry: true });
    if (!res.ok) throw new ServiceError(data?.error || `ListenBrainz: HTTP ${res.status}`);
    return data;
  }

  function lbTrackMetadata(item) {
    return {
      artist_name: item.artist,
      track_name: item.title,
      ...(item.album ? { release_name: item.album } : {}),
      additional_info: {
        media_player: 'Next Music',
        submission_client: 'Next Music Scrobbler',
        music_service: 'music.yandex.ru',
        ...(item.artists && item.artists.length > 1 ? { artist_names: item.artists } : {}),
        ...(item.duration ? { duration_ms: Math.round(item.duration * 1000) } : {})
      }
    };
  }

  async function lbNowPlaying(item, s) {
    await lbRequest('submit-listens', {
      method: 'POST',
      token: s.listenbrainz.token,
      body: { listen_type: 'playing_now', payload: [{ track_metadata: lbTrackMetadata(item) }] }
    });
  }

  async function lbScrobble(items, s) {
    await lbRequest('submit-listens', {
      method: 'POST',
      token: s.listenbrainz.token,
      body: {
        listen_type: items.length > 1 ? 'import' : 'single',
        payload: items.map(item => ({ listened_at: item.ts, track_metadata: lbTrackMetadata(item) }))
      }
    });
  }

  // --- Очередь скробблов: пока нет сети, треки копятся и уйдут позже ---

  function enqueue(item) {
    if (!isLbConnected()) return;
    const q = loadQueue();
    q.listenbrainz.push(item);
    saveQueue(q);
    flushQueue();
  }

  async function flushQueue() {
    if (flushing || isDisposed) return;
    flushing = true;
    try {
      while (!isDisposed) {
        const s = loadSettings();
        const q = loadQueue();
        if (!isLbConnected(s) || !q.listenbrainz.length) return;

        const batch = q.listenbrainz.slice(0, CONFIG.batchSize);
        try {
          await lbScrobble(batch, s);
        } catch (e) {
          if (e.auth) {
            handleAuthFailure(e.message);
            return;
          }
          if (e.retry) {
            console.warn('[Scrobbler] Will retry later:', e.message);
            return;
          }
          // Сервис отверг запись как некорректную: выбрасываем, чтобы очередь не застряла навсегда
          console.warn('[Scrobbler] Dropping rejected batch:', e.message);
        }

        const fresh = loadQueue();
        fresh.listenbrainz = fresh.listenbrainz.slice(batch.length);
        saveQueue(fresh);
        console.log(`[Scrobbler] Sent ${batch.length} scrobble(s)`);
      }
    } finally {
      flushing = false;
    }
  }

  function handleAuthFailure(message) {
    const s = loadSettings();
    s.listenbrainz.token = '';
    saveSettings(s);
    notifyUser(`ListenBrainz: нужно подключить заново. ${message}`, true);
    refreshModalState();
  }

  async function sendNowPlaying(item) {
    const s = loadSettings();
    if (!isLbConnected(s)) return;
    try {
      await lbNowPlaying(item, s);
    } catch (e) {
      if (e.auth) handleAuthFailure(e.message);
    }
  }

  // --- Данные о воспроизведении ---

  function getPlaybackInfo() {
    const api = window.nextmusicApi;
    if (!api) return null;

    const track = api.getCurrentTrack();
    const state = api.getState();
    if (!track || !state) return null;

    const rawStatus = state.status?.value ?? state.status ?? '';
    const statusStr = String(rawStatus).toLowerCase();
    const isPlaying = statusStr === 'playing' || statusStr === 'play';

    const title = (track.title ?? '').trim();
    let artists = [];
    if (Array.isArray(track.artistNames) && track.artistNames.length > 0) {
      artists = track.artistNames;
    } else if (Array.isArray(track.artists) && track.artists.length > 0) {
      artists = track.artists.map(a => typeof a === 'string' ? a : (a?.name || ''));
    }
    artists = artists.map(a => String(a).trim()).filter(Boolean);
    if (!title || !artists.length) return null;

    const album = (Array.isArray(track.albums) && track.albums[0]?.title) || track.albumTitle || track.album?.title || '';

    let position = 0;
    let duration = 0;
    try {
      const audios = Array.from(document.querySelectorAll('audio'));
      const audio = api.getActiveAudioElement?.() || audios.find(a => !a.paused && a.currentTime > 0) || audios.find(a => a.currentTime > 0);
      if (audio) {
        position = audio.currentTime;
        if (Number.isFinite(audio.duration) && audio.duration > 0) duration = audio.duration;
      }
    } catch {}
    if (!position) {
      const apiTime = api.getAudioTime?.();
      if (typeof apiTime === 'number') position = apiTime;
    }
    if (!duration) {
      const ms = track.durationMs ?? track.duration;
      if (typeof ms === 'number' && ms > 0) duration = ms > 10000 ? ms / 1000 : ms;
    }

    const id = track.id || track.realId || null;
    return {
      key: id ? String(id) : `${title}__${artists.join(',')}`,
      title,
      artist: artists[0],
      artists,
      album: String(album || '').trim(),
      duration,
      position,
      isPlaying
    };
  }

  // Основной цикл: считаем реально прослушанное время, а не позицию, чтобы перемотка не накручивала скробблы
  function tick() {
    if (isDisposed) return;
    const now = Date.now();
    const delta = (now - lastTickAt) / 1000;
    lastTickAt = now;

    const s = loadSettings();
    if (!isLbConnected(s)) return;

    const info = getPlaybackInfo();
    if (!info) return;

    const startedNew = !current || current.key !== info.key;
    const looped = current && current.key === info.key && current.scrobbled &&
      info.position < 5 && current.lastPos - info.position > 10;

    if (startedNew || looped) {
      current = {
        key: info.key,
        ts: Math.floor(now / 1000 - info.position),
        played: 0,
        lastPos: info.position,
        nowSent: false,
        scrobbled: false
      };
      if (info.duration && info.duration < CONFIG.minTrackSec) current.scrobbled = true;
    }

    current.lastPos = info.position;
    if (!info.isPlaying) return;
    if (delta > 0 && delta < 3) current.played += delta;

    const item = {
      artist: info.artist,
      artists: info.artists,
      title: info.title,
      album: info.album,
      duration: info.duration || 0,
      ts: current.ts
    };

    if (!current.nowSent && !current.scrobbled && current.played >= CONFIG.nowPlayingAfterSec) {
      current.nowSent = true;
      sendNowPlaying(item);
    }

    const threshold = info.duration
      ? Math.min(info.duration / 2, CONFIG.maxThresholdSec)
      : CONFIG.maxThresholdSec;

    if (!current.scrobbled && current.played >= threshold) {
      current.scrobbled = true;
      console.log(`[Scrobbler] Scrobble: ${info.artist} — ${info.title}`);
      enqueue(item);
    }
  }

  // --- UI ---

  function injectStyles() {
    if (document.getElementById('nm-scrobbler-styles')) return;
    const style = document.createElement('style');
    style.id = 'nm-scrobbler-styles';
    style.textContent = `
      .nm-scr-btn-trackbar {
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
      .nm-scr-btn-trackbar:hover {
        color: #ffffff !important;
        background: rgba(255, 255, 255, 0.1) !important;
      }
      .nm-scr-btn-trackbar:active { transform: scale(0.92) !important; }
      .nm-scr-btn-trackbar.connected { color: #4ade80 !important; }
      .nm-scr-btn-trackbar svg {
        width: 20px !important;
        height: 20px !important;
        display: block !important;
        pointer-events: none !important;
        fill: currentColor !important;
      }
      .nm-scr-modal-overlay {
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
      .nm-scr-modal-overlay.open { opacity: 1; pointer-events: auto; }
      .nm-scr-modal {
        background: #141416;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        width: 520px;
        max-width: 90vw;
        max-height: 90vh;
        overflow-y: auto;
        padding: 24px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
        color: #ffffff;
        font-family: inherit;
      }
      .nm-scr-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .nm-scr-title { font-size: 17px; font-weight: 600; }
      .nm-scr-close {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        line-height: 1;
      }
      .nm-scr-close:hover { color: #fff; background: rgba(255, 255, 255, 0.08); }
      .nm-scr-desc {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.5;
        margin-bottom: 16px;
      }
      .nm-scr-section {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 12px;
        padding: 14px;
        margin-bottom: 14px;
      }
      .nm-scr-section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 10px;
      }
      .nm-scr-badge {
        font-size: 11px;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.6);
      }
      .nm-scr-badge.on { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
      .nm-scr-hint {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
        line-height: 1.5;
        margin-bottom: 10px;
      }
      .nm-scr-hint a { color: #93c5fd; }
      .nm-scr-label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
        margin: 8px 0 4px;
      }
      .nm-scr-input {
        width: 100%;
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        padding: 9px 12px;
        color: #ffffff;
        font-size: 13px;
        outline: none;
        transition: border-color 0.2s;
        font-family: monospace;
      }
      .nm-scr-input:focus { border-color: rgba(255, 255, 255, 0.4); }
      .nm-scr-status {
        font-size: 12px;
        margin: 10px 0 0;
        min-height: 16px;
        word-break: break-word;
      }
      .nm-scr-status.ok { color: #4ade80; }
      .nm-scr-status.err { color: #f87171; }
      .nm-scr-status.loading { color: #94a3b8; }
      .nm-scr-row {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 12px;
        flex-wrap: wrap;
      }
      .nm-scr-btn {
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.85);
        transition: background 0.15s ease;
      }
      .nm-scr-btn:hover { background: rgba(255, 255, 255, 0.14); color: #fff; }
      .nm-scr-btn:disabled { opacity: 0.5; cursor: default; }
      .nm-scr-btn.primary { background: #3b82f6; color: #fff; }
      .nm-scr-btn.primary:hover { background: #2563eb; }
      .nm-scr-btn.danger:hover { background: rgba(248, 113, 113, 0.25); color: #fca5a5; }
      .nm-scr-stats-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      .nm-scr-select {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 8px;
        color: #fff;
        font-size: 12px;
        padding: 5px 8px;
        outline: none;
      }
      .nm-scr-select option { background: #141416; }
      .nm-scr-total {
        margin-left: auto;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
      }
      .nm-scr-total b { color: #fff; font-size: 15px; }
      .nm-scr-stats-cols {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      @media (max-width: 560px) { .nm-scr-stats-cols { grid-template-columns: 1fr; } }
      .nm-scr-list-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.45);
        margin: 0 0 6px;
      }
      .nm-scr-list { list-style: none; margin: 0 0 12px; padding: 0; }
      .nm-scr-list li {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-size: 12.5px;
        line-height: 1.7;
      }
      .nm-scr-rank { width: 16px; color: rgba(255, 255, 255, 0.35); text-align: right; flex-shrink: 0; }
      .nm-scr-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nm-scr-name small { color: rgba(255, 255, 255, 0.5); }
      .nm-scr-count { color: rgba(255, 255, 255, 0.55); font-variant-numeric: tabular-nums; flex-shrink: 0; }
      .nm-scr-empty { font-size: 12px; color: rgba(255, 255, 255, 0.45); margin: 0 0 12px; }
      .nm-scr-hidden { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function setStatus(el, text, kind = '') {
    el.className = 'nm-scr-status' + (kind ? ' ' + kind : '');
    el.textContent = text;
  }

  function createModal() {
    if (modalOverlayEl) return;

    modalOverlayEl = document.createElement('div');
    modalOverlayEl.className = 'nm-scr-modal-overlay';
    modalOverlayEl.innerHTML = `
      <div class="nm-scr-modal">
        <div class="nm-scr-header">
          <div class="nm-scr-title">Scrobbler</div>
          <button class="nm-scr-close" title="Закрыть">&times;</button>
        </div>
        <div class="nm-scr-desc">
          Отправляет прослушанные треки в ListenBrainz. Трек засчитывается после половины
          длительности или 4 минут, перемотка время не накручивает. Если сети нет, скроббли копятся и уходят позже.
        </div>

        <div class="nm-scr-section" id="nm-scr-lb">
          <div class="nm-scr-section-title">ListenBrainz <span class="nm-scr-badge" id="nm-scr-lb-badge">не подключено</span></div>
          <div id="nm-scr-lb-setup">
            <div class="nm-scr-hint">
              Токен берётся на
              <a href="https://listenbrainz.org/settings/" target="_blank" rel="noreferrer">listenbrainz.org/settings</a>
              в разделе User token.
            </div>
            <label class="nm-scr-label" for="nm-scr-lb-token">User token</label>
            <input type="password" id="nm-scr-lb-token" class="nm-scr-input" autocomplete="off" />
            <div class="nm-scr-row">
              <button class="nm-scr-btn primary" id="nm-scr-lb-save">Проверить и сохранить</button>
            </div>
          </div>
          <div id="nm-scr-lb-connected" class="nm-scr-hidden">
            <div class="nm-scr-row" style="margin-top:0">
              <button class="nm-scr-btn danger" id="nm-scr-lb-disconnect">Отключить</button>
            </div>
          </div>
          <div class="nm-scr-status" id="nm-scr-lb-status"></div>
        </div>

        <div class="nm-scr-section nm-scr-hidden" id="nm-scr-stats">
          <div class="nm-scr-stats-head">
            <div class="nm-scr-section-title" style="margin:0">Статистика</div>
            <select class="nm-scr-select" id="nm-scr-range">
              <option value="this_week">Неделя</option>
              <option value="this_month" selected>Месяц</option>
              <option value="this_year">Год</option>
              <option value="all_time">Всё время</option>
            </select>
            <button class="nm-scr-btn" id="nm-scr-stats-refresh" title="Обновить">Обновить</button>
            <div class="nm-scr-total">Всего: <b id="nm-scr-total">-</b></div>
          </div>
          <div class="nm-scr-stats-cols">
            <div>
              <div class="nm-scr-list-title">Исполнители</div>
              <div id="nm-scr-top-artists"></div>
            </div>
            <div>
              <div class="nm-scr-list-title">Треки</div>
              <div id="nm-scr-top-tracks"></div>
            </div>
          </div>
          <div class="nm-scr-list-title">Недавно</div>
          <div id="nm-scr-recent"></div>
          <div class="nm-scr-status" id="nm-scr-stats-status"></div>
        </div>

        <div class="nm-scr-hint" id="nm-scr-queue-info"></div>
      </div>
    `;
    document.body.appendChild(modalOverlayEl);

    const $ = (id) => modalOverlayEl.querySelector('#' + id);
    const closeModal = () => modalOverlayEl.classList.remove('open');

    modalOverlayEl.querySelector('.nm-scr-close').addEventListener('click', closeModal);
    modalOverlayEl.addEventListener('click', (e) => { if (e.target === modalOverlayEl) closeModal(); });

    $('nm-scr-lb-save').addEventListener('click', async () => {
      const token = $('nm-scr-lb-token').value.trim();
      const status = $('nm-scr-lb-status');
      if (!token) {
        setStatus(status, 'Вставь токен', 'err');
        return;
      }
      setStatus(status, 'Проверка токена...', 'loading');
      try {
        const data = await lbRequest('validate-token', { token });
        if (!data?.valid) {
          setStatus(status, 'Ошибка: токен недействителен', 'err');
          return;
        }
        const s = loadSettings();
        s.listenbrainz.token = token;
        s.listenbrainz.username = data.user_name || '';
        saveSettings(s);
        notifyUser(`ListenBrainz подключён (${data.user_name})`);
        refreshModalState();
        loadStats();
        flushQueue();
      } catch (e) {
        setStatus(status, `Ошибка: ${e.message}`, 'err');
      }
    });

    $('nm-scr-range').addEventListener('change', loadStats);
    $('nm-scr-stats-refresh').addEventListener('click', loadStats);

    $('nm-scr-lb-disconnect').addEventListener('click', () => {
      const s = loadSettings();
      s.listenbrainz.token = '';
      s.listenbrainz.username = '';
      saveSettings(s);
      const q = loadQueue();
      q.listenbrainz = [];
      saveQueue(q);
      refreshModalState();
    });
  }

  // Приводит окно и кнопку в плеере в соответствие с сохранёнными подключениями
  function refreshModalState() {
    const s = loadSettings();
    const lb = isLbConnected(s);

    document.getElementById('nm-scr-btn')?.classList.toggle('connected', lb);
    if (!modalOverlayEl) return;

    const $ = (id) => modalOverlayEl.querySelector('#' + id);
    const badge = (el, on, text) => {
      el.textContent = on ? text : 'не подключено';
      el.classList.toggle('on', on);
    };

    badge($('nm-scr-lb-badge'), lb, s.listenbrainz.username || 'подключено');
    $('nm-scr-lb-setup').classList.toggle('nm-scr-hidden', lb);
    $('nm-scr-lb-connected').classList.toggle('nm-scr-hidden', !lb);
    if (lb) setStatus($('nm-scr-lb-status'), '');
    else $('nm-scr-lb-token').value = '';

    $('nm-scr-stats').classList.toggle('nm-scr-hidden', !lb);

    const q = loadQueue();
    const waiting = (lb ? q.listenbrainz.length : 0);
    $('nm-scr-queue-info').textContent = waiting ? `Ждут отправки: ${waiting}` : '';
  }

  // Статистика берётся из API ListenBrainz. Топы там считаются с задержкой в несколько часов,
  // поэтому у свежего аккаунта сначала видны только «Всего» и «Недавно».
  let statsRequestId = 0;

  function renderList(container, rows, emptyText) {
    container.textContent = '';
    if (!rows.length) {
      const p = document.createElement('div');
      p.className = 'nm-scr-empty';
      p.textContent = emptyText;
      container.appendChild(p);
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'nm-scr-list';
    rows.forEach((row, i) => {
      const li = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'nm-scr-rank';
      rank.textContent = String(i + 1);
      const name = document.createElement('span');
      name.className = 'nm-scr-name';
      name.textContent = row.name;
      if (row.sub) {
        const small = document.createElement('small');
        small.textContent = ` — ${row.sub}`;
        name.appendChild(small);
      }
      name.title = row.sub ? `${row.name} — ${row.sub}` : row.name;
      li.append(rank, name);
      if (row.count != null) {
        const count = document.createElement('span');
        count.className = 'nm-scr-count';
        count.textContent = String(row.count);
        li.appendChild(count);
      }
      ul.appendChild(li);
    });
    container.appendChild(ul);
  }

  function timeAgo(ts) {
    const sec = Math.max(0, Math.floor(Date.now() / 1000 - ts));
    if (sec < 60) return 'только что';
    if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} ч назад`;
    return `${Math.floor(sec / 86400)} дн назад`;
  }

  async function loadStats() {
    if (!modalOverlayEl) return;
    const s = loadSettings();
    const user = s.listenbrainz.username;
    if (!isLbConnected(s) || !user) return;

    const $ = (id) => modalOverlayEl.querySelector('#' + id);
    const range = $('nm-scr-range').value;
    const enc = encodeURIComponent(user);
    const token = s.listenbrainz.token;
    const myId = ++statsRequestId;
    const status = $('nm-scr-stats-status');
    setStatus(status, 'Загружаю...', 'loading');

    const [artists, tracks, count, recent] = await Promise.allSettled([
      lbRequest(`stats/user/${enc}/artists?range=${range}&count=10`, { token }),
      lbRequest(`stats/user/${enc}/recordings?range=${range}&count=10`, { token }),
      lbRequest(`user/${enc}/listen-count`, { token }),
      lbRequest(`user/${enc}/listens?count=8`, { token })
    ]);
    if (myId !== statsRequestId || isDisposed) return;

    const value = (r) => (r.status === 'fulfilled' ? r.value : null);
    const allFailed = [artists, tracks, count, recent].every(r => r.status === 'rejected');

    $('nm-scr-total').textContent = value(count)?.payload?.count ?? '-';

    // Пустой ответ (204) значит, что ListenBrainz ещё не посчитал топы за этот период
    const noStats = 'Пока не посчитано: ListenBrainz обновляет топы раз в несколько часов';
    renderList($('nm-scr-top-artists'),
      (value(artists)?.payload?.artists || []).map(a => ({ name: a.artist_name, count: a.listen_count })), noStats);
    renderList($('nm-scr-top-tracks'),
      (value(tracks)?.payload?.recordings || []).map(t => ({ name: t.track_name, sub: t.artist_name, count: t.listen_count })), noStats);
    renderList($('nm-scr-recent'),
      (value(recent)?.payload?.listens || []).map(l => ({
        name: l.track_metadata?.track_name || '',
        sub: l.track_metadata?.artist_name || '',
        count: l.listened_at ? timeAgo(l.listened_at) : null
      })), 'Пока нет прослушиваний');

    if (allFailed) {
      setStatus(status, `Не удалось загрузить статистику: ${artists.reason?.message || 'нет связи'}`, 'err');
    } else {
      setStatus(status, '');
    }
  }

  function openSettingsModal() {
    createModal();
    refreshModalState();
    modalOverlayEl.classList.add('open');
    loadStats();
  }

  // Кнопка в правой части плеера, рядом с очередью и громкостью
  function injectButton() {
    if (document.getElementById('nm-scr-btn')) return;

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
    btn.id = 'nm-scr-btn';
    btn.className = 'nm-scr-btn-trackbar';
    btn.title = 'Настройки Scrobbler';
    btn.setAttribute('aria-label', 'Настройки Scrobbler');
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill:none !important">
        <path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>
      </svg>
    `;

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

    let refChild = null;
    const vol = actions.querySelector('[class*="Volume"], [class*="volume"]') || volumeEl;
    if (vol && actions.contains(vol)) {
      let curr = vol;
      while (curr && curr.parentElement && curr.parentElement !== actions) curr = curr.parentElement;
      if (curr && curr.parentElement === actions) refChild = curr;
    }

    try {
      if (refChild) actions.insertBefore(btn, refChild);
      else actions.appendChild(btn);
    } catch {
      actions.appendChild(btn);
    }
    refreshModalState();
  }

  function init() {
    injectStyles();
    timers.push(setInterval(tick, CONFIG.tickMs));
    timers.push(setInterval(injectButton, 1000));
    timers.push(setInterval(flushQueue, CONFIG.flushIntervalMs));
    // Чистим данные прошлых версий (Last.fm убран)
    saveSettings(loadSettings());
    saveQueue(loadQueue());
    flushQueue();

    window.__scrobblerAddon = {
      openSettings: openSettingsModal,
      dispose: () => {
        isDisposed = true;
        timers.forEach(clearInterval);
        document.getElementById('nm-scrobbler-styles')?.remove();
        document.getElementById('nm-scr-btn')?.remove();
        modalOverlayEl?.remove();
      }
    };

    console.log('[Scrobbler] Addon ready');
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

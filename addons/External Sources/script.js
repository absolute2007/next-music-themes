(() => {
  'use strict';

  if (window.__externalSourcesAddon?.dispose) {
    try { window.__externalSourcesAddon.dispose(); } catch (e) {}
  }

  const LOG = '[ExternalSources]';
  const SETTINGS_KEY = 'nm-ext-settings';
  const YM_HEADERS = {
    'x-yandex-music-client': 'YandexMusicWebNext/1.0.0',
    'x-retpath-y': 'https://music.yandex.ru/'
  };
  const VK_API_VERSION = '5.131';
  const VK_TOKEN_URL = 'https://oauth.vk.com/authorize?client_id=2685278&scope=audio,offline&redirect_uri=https%3A%2F%2Foauth.vk.com%2Fblank.html&display=page&response_type=token&revoke=1';
  const MAX_PARALLEL_JOBS = 2;

  let isDisposed = false;
  let isTabActive = false;
  let navItemEl = null;
  let viewEl = null;
  let activeMenu = null;
  let searchTimer = null;
  let searchSeq = 0;

  let cachedUid = null;
  let cachedPlaylists = [];

  // ---------------------------------------------------------------- utils

  const ICONS = {
    cloud: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><path d="M12 11v4"/><circle cx="10" cy="15" r="2"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>',
    play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z"/></svg>',
    pause: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4.5" height="16" rx="1"/><rect x="13.5" y="4" width="4.5" height="16" rx="1"/></svg>',
    heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    heartFilled: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
    retry: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>'
  };

  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function fmtDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return '';
    const s = Math.round(sec);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  function parseDuration(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const parts = String(value).split(':').map(Number);
    if (parts.some((n) => !Number.isFinite(n))) return Number(value) || 0;
    return parts.reduce((acc, n) => acc * 60 + n, 0);
  }

  let toastTimer = null;
  let nativeToast = null;

  // Хэшированные классы нативных уведомлений ЯМ: берём их из стилей страницы, чтобы тост выглядел как родной
  function nativeToastClasses() {
    if (nativeToast) return nativeToast;
    const want = { root: 'BaseNotification_root__', message: 'BaseNotification_message__', errRoot: 'BaseNotificationError_root__', errMessage: 'BaseNotificationError_message__' };
    const found = {};
    for (const sheet of document.styleSheets) {
      let rules;
      try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        const sel = r.selectorText;
        if (!sel) continue;
        for (const [k, prefix] of Object.entries(want)) {
          if (found[k]) continue;
          const m = sel.match(new RegExp(`\\.(${prefix}[\\w-]+)`));
          if (m) found[k] = m[1];
        }
      }
    }
    if (found.root) nativeToast = found;
    return found;
  }

  function notify(text, isError = false) {
    console.log(LOG, text);
    let el = document.getElementById('nm-ext-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nm-ext-toast';
      el.setAttribute('role', 'status');
      el.appendChild(document.createElement('div'));
      document.body.appendChild(el);
    }
    const c = nativeToastClasses();
    el.className = ['nm-ext-toast', 'show', isError && 'err', c.root, isError && c.errRoot].filter(Boolean).join(' ');
    el.firstChild.className = ['nm-ext-toast-text', c.message, isError && c.errMessage].filter(Boolean).join(' ');
    el.firstChild.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isError ? 9000 : 3500);
  }

  function loadSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) { return {}; }
  }

  function saveSettings(patch) {
    const next = { ...loadSettings(), ...patch };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }

  async function fetchT(url, options = {}, timeout = 15000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal });
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Сервис не ответил вовремя');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchJson(url, options, timeout) {
    const res = await fetchT(url, options, timeout);
    if (!res.ok) {
      const err = new Error(`Сервис ответил ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  // Скачивание с прогрессом (по content-length, если сервер его отдаёт)
  async function fetchBlob(url, onProgress) {
    const res = await fetchT(url, {}, 60000);
    if (!res.ok) throw new Error(`Не удалось скачать файл (${res.status})`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !res.body.getReader) {
      const blob = await res.blob();
      onProgress?.(1);
      return blob;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      if (total) onProgress?.(Math.min(loaded / total, 1));
    }
    onProgress?.(1);
    return new Blob(chunks, { type: res.headers.get('content-type') || '' });
  }

  // ------------------------------------------------------------ HLS (VK)

  function parseAttrs(line) {
    const attrs = {};
    const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
    let m;
    while ((m = re.exec(line))) attrs[m[1]] = m[2].replace(/^"|"$/g, '');
    return attrs;
  }

  function hexToBytes(hex) {
    const clean = hex.replace(/^0x/i, '').padStart(32, '0');
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  function seqToIv(seq) {
    const iv = new Uint8Array(16);
    new DataView(iv.buffer).setUint32(12, seq >>> 0);
    return iv;
  }

  // Вырезает аудио из MPEG-TS: на выходе чистый MP3 или AAC (ADTS)
  function demuxTs(buffers) {
    const out = [];
    let audioPid = -1;
    for (const buf of buffers) {
      const u8 = new Uint8Array(buf);
      for (let i = 0; i + 188 <= u8.length; i += 188) {
        if (u8[i] !== 0x47) continue;
        const pusi = (u8[i + 1] & 0x40) !== 0;
        const pid = ((u8[i + 1] & 0x1f) << 8) | u8[i + 2];
        const afc = (u8[i + 3] >> 4) & 3;
        if (!(afc & 1)) continue;
        let o = i + 4;
        if (afc & 2) o += 1 + u8[i + 4];
        if (pusi && u8[o] === 0 && u8[o + 1] === 0 && u8[o + 2] === 1) {
          const streamId = u8[o + 3];
          if (audioPid < 0 && streamId >= 0xc0 && streamId <= 0xdf) audioPid = pid;
          if (pid === audioPid) {
            o += 9 + u8[o + 8];
            out.push(u8.subarray(o, i + 188));
          }
        } else if (pid === audioPid) {
          out.push(u8.subarray(o, i + 188));
        }
      }
    }
    if (audioPid < 0 || !out.length) throw new Error('В потоке не нашлось аудиодорожки');
    return out;
  }

  function sniffAudio(first) {
    if (first[0] === 0x49 && first[1] === 0x44 && first[2] === 0x33) return 'mp3';
    if (first[0] === 0xff && (first[1] & 0xe0) === 0xe0) return ((first[1] >> 1) & 3) === 0 ? 'aac' : 'mp3';
    if (first[4] === 0x66 && first[5] === 0x74 && first[6] === 0x79 && first[7] === 0x70) return 'm4a';
    return 'mp3';
  }

  const MIME_BY_EXT = { mp3: 'audio/mpeg', aac: 'audio/aac', m4a: 'audio/mp4' };

  async function downloadHls(playlistUrl, onProgress, depth = 0) {
    const text = await (await fetchT(playlistUrl, {}, 20000)).text();
    const absolute = (u) => new URL(u, playlistUrl).href;
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    if (lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'))) {
      if (depth > 2) throw new Error('Слишком глубокий плейлист HLS');
      const idx = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'));
      const next = lines.slice(idx + 1).find((l) => !l.startsWith('#'));
      if (!next) throw new Error('Пустой мастер-плейлист HLS');
      return downloadHls(absolute(next), onProgress, depth + 1);
    }

    let seq = 0;
    let key = null;
    let mapUrl = null;
    const segments = [];
    for (const line of lines) {
      if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        seq = Number(line.split(':')[1]) || 0;
      } else if (line.startsWith('#EXT-X-KEY:')) {
        const a = parseAttrs(line.slice(11));
        key = a.METHOD === 'AES-128' && a.URI ? { uri: absolute(a.URI), iv: a.IV || null } : null;
        if (a.METHOD && a.METHOD !== 'AES-128' && a.METHOD !== 'NONE') throw new Error('Поток защищён неподдерживаемым шифрованием');
      } else if (line.startsWith('#EXT-X-MAP:')) {
        mapUrl = absolute(parseAttrs(line.slice(11)).URI);
      } else if (!line.startsWith('#')) {
        segments.push({ url: absolute(line), key, seq: seq + segments.length });
      }
    }
    if (!segments.length) throw new Error('В плейлисте нет сегментов');

    const keyCache = new Map();
    const getKey = (uri) => {
      if (!keyCache.has(uri)) {
        keyCache.set(uri, (async () => {
          const raw = await (await fetchT(uri, {}, 20000)).arrayBuffer();
          return crypto.subtle.importKey('raw', raw, 'AES-CBC', false, ['decrypt']);
        })());
      }
      return keyCache.get(uri);
    };

    const buffers = new Array(segments.length);
    let done = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < segments.length) {
        const i = cursor++;
        const seg = segments[i];
        const res = await fetchT(seg.url, {}, 30000);
        if (!res.ok) throw new Error(`Сегмент потока недоступен (${res.status})`);
        let data = await res.arrayBuffer();
        if (seg.key) {
          const iv = seg.key.iv ? hexToBytes(seg.key.iv) : seqToIv(seg.seq);
          data = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, await getKey(seg.key.uri), data);
        }
        buffers[i] = data;
        onProgress?.(++done / segments.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, segments.length) }, worker));

    if (mapUrl) buffers.unshift(await (await fetchT(mapUrl, {}, 20000)).arrayBuffer());

    const isTs = new Uint8Array(buffers[0])[0] === 0x47;
    const parts = isTs ? demuxTs(buffers) : buffers;
    const first = parts[0] instanceof Uint8Array ? parts[0] : new Uint8Array(parts[0]);
    const ext = sniffAudio(first);
    return { blob: new Blob(parts, { type: MIME_BY_EXT[ext] }), ext };
  }

  // ------------------------------------------------------------ providers

  const ARTIST_ALIASES = {
    'гон флад': 'gone fludd', 'гонфлад': 'gone fludd', 'кизару': 'kizaru',
    'оксимирон': 'oxxxymiron', 'скриптонит': 'scriptonite', 'биг бейби тейп': 'big baby tape',
    'мейби бейби': 'maybe baby', 'моргенштерн': 'morgenstern', 'мияги': 'miyagi'
  };

  function transliterate(str) {
    const ru = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
    const en = ['a','b','v','g','d','e','yo','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','shch','','y','','e','yu','ya'];
    return [...str].map((c) => {
      const i = ru.indexOf(c.toLowerCase());
      if (i < 0) return c;
      return c === c.toLowerCase() ? en[i] : en[i].charAt(0).toUpperCase() + en[i].slice(1);
    }).join('');
  }

  const zaycev = {
    id: 'zaycev',
    name: 'Zaycev',
    async search(query) {
      const variants = [query];
      const lower = query.toLowerCase();
      for (const [ru, en] of Object.entries(ARTIST_ALIASES)) {
        if (lower.includes(ru)) variants.push(lower.replace(ru, en));
      }
      if (/[а-яё]/i.test(query)) variants.push(transliterate(query));

      const seen = new Set();
      const tracks = [];
      for (const q of [...new Set(variants)]) {
        let data;
        try {
          data = await fetchJson(`https://zaycev.net/api/external/pages/search/tracks?q=${encodeURIComponent(q)}&page=1&limit=30`);
        } catch (e) {
          if (!tracks.length && q === variants[variants.length - 1]) throw e;
          continue;
        }
        if (data.popularInSearch === true) continue;
        for (const id of data.trackIds || []) {
          const info = data.tracksInfo?.[String(id)];
          if (!info || seen.has(id)) continue;
          seen.add(id);
          tracks.push({
            source: 'zaycev', id: String(id), key: `zaycev:${id}`,
            title: info.track || 'Без названия', artist: info.artistName || '',
            durationSec: parseDuration(info.duration),
            cover: info.imageWebp || info.imageJpg || ''
          });
        }
        if (tracks.length >= 20) break;
      }
      return tracks;
    },
    async resolve(track) {
      const meta = await fetchJson('https://zaycev.net/api/external/track/filezmeta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackIds: [Number(track.id)], subscription: false })
      });
      const hash = meta.tracks?.[0]?.streaming;
      if (!hash) throw new Error('Аудиопоток трека недоступен');
      const play = await fetchJson(`https://zaycev.net/api/external/track/play/${hash}`);
      if (!play.url) throw new Error('Ссылка на аудиофайл пуста');
      return { kind: 'file', url: play.url };
    }
  };

  // Bandcamp: поиск через публичный автокомплит, полный mp3-128 берём со страницы трека.
  // Если артист закрыл прослушивание, у трека нет файла — сообщаем об этом при добавлении.
  const bandcamp = {
    id: 'bandcamp',
    name: 'Bandcamp',
    async search(query) {
      const data = await fetchJson('https://bandcamp.com/api/bcsearch_public_api/1/autocomplete_elastic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_text: query, search_filter: 't', full_page: false, fan_id: null })
      });
      return (data.auto?.results || [])
        .filter((t) => t.type === 't' && t.item_url_path)
        .map((t) => ({
          source: 'bandcamp', id: String(t.id), key: `bandcamp:${t.id}`,
          title: t.name || 'Без названия', artist: t.band_name || '',
          durationSec: 0,
          cover: t.img || '',
          raw: { page: t.item_url_path }
        }));
    },
    async resolve(track) {
      const html = await (await fetchT(track.raw.page, {}, 15000)).text();
      const m = html.match(/data-tralbum="([^"]+)"/);
      if (!m) throw new Error('Bandcamp не отдал страницу трека');
      const el = document.createElement('textarea');
      el.innerHTML = m[1];
      const info = JSON.parse(el.value).trackinfo?.[0];
      const url = info?.file?.['mp3-128'];
      if (!url) throw new Error('Артист закрыл прослушивание этого трека на Bandcamp');
      if (info.duration && !track.durationSec) track.durationSec = Math.round(info.duration);
      return { kind: 'file', url };
    }
  };

  // Фоновый прокси (vk-proxy.cjs) добавляет User-Agent Kate Mobile, без которого VK закрывает audio.*.
  // Проверяем его тихо и запоминаем результат на минуту.
  const VK_PROXY = 'http://127.0.0.1:2008';
  let vkProxyCheck = { at: 0, ok: false };

  async function vkProxyAvailable(force = false) {
    if (!force && Date.now() - vkProxyCheck.at < 60000) return vkProxyCheck.ok;
    let ok = false;
    try {
      const data = await fetchJson(`${VK_PROXY}/ping`, {}, 1500);
      ok = data?.name === 'nm-vk-proxy';
    } catch (e) { /* не запущен */ }
    vkProxyCheck = { at: Date.now(), ok };
    return ok;
  }

  const vk = {
    id: 'vk',
    name: 'VK',
    needsSetup: () => !loadSettings().vkToken,
    async call(method, params, token = loadSettings().vkToken) {
      const query = new URLSearchParams({ ...params, access_token: token, v: VK_API_VERSION });
      const viaProxy = await vkProxyAvailable();
      const base = viaProxy ? VK_PROXY : 'https://api.vk.com';
      const u = new URL(`${base}/method/${method}?${query}`);
      let data;
      try {
        data = await fetchJson(u.href);
      } catch (e) {
        // прокси мог упасть: перепроверим при следующем запросе
        if (viaProxy) vkProxyCheck.at = 0;
        throw e;
      }
      // 6 — больше трёх запросов в секунду: ждём и повторяем один раз
      if (data.error?.error_code === 6) {
        await new Promise((r) => setTimeout(r, 1100));
        data = await fetchJson(u.href);
      }
      if (data.error) {
        const err = new Error(data.error.error_msg || 'Ошибка VK');
        err.code = data.error.error_code;
        // 9 — flood control: VK временно ограничил этот метод для токена
        if (err.code === 3 && method.startsWith('audio.')) {
          err.message = viaProxy
            ? 'VK не отдал музыку даже через фоновый помощник. Войдите в VK заново'
            : 'Не запущен фоновый помощник VK. Переустановите аддон через install.ps1 или перезагрузите компьютер';
          vkProxyCheck.at = 0;
        }
        if (err.code === 9) err.message = 'VK временно ограничил запросы (flood control). Подождите несколько минут';
        throw err;
      }
      return data.response;
    },
    async search(query) {
      if (this.needsSetup()) throw Object.assign(new Error('Нужен токен VK'), { setup: true });
      let res;
      try {
        res = await this.call('audio.search', { q: query, count: 30, auto_complete: 1 });
      } catch (e) {
        if (e.code === 5) throw Object.assign(new Error('Токен VK недействителен'), { setup: true });
        throw e;
      }
      return (res.items || [])
        .filter((a) => a.url)
        .map((a) => ({
          source: 'vk', id: `${a.owner_id}_${a.id}`, key: `vk:${a.owner_id}_${a.id}`,
          title: a.title || 'Без названия', artist: a.artist || '',
          durationSec: a.duration || 0,
          cover: a.album?.thumb?.photo_135 || a.album?.thumb?.photo_68 || '',
          raw: { url: a.url }
        }));
    },
    async resolve(track) {
      const url = track.raw.url;
      return { kind: /\.m3u8(\?|$)/.test(url) ? 'hls' : 'file', url };
    }
  };

  const archive = {
    id: 'archive',
    name: 'Internet Archive',
    async search(query) {
      const params = new URLSearchParams();
      params.set('q', `(${query}) AND mediatype:audio`);
      ['identifier', 'title', 'creator'].forEach((f) => params.append('fl[]', f));
      params.append('sort[]', 'downloads desc');
      params.set('rows', '10');
      params.set('output', 'json');
      const found = await fetchJson(`https://archive.org/advancedsearch.php?${params}`);
      const docs = found.response?.docs || [];

      const metas = await Promise.all(docs.map((d) =>
        fetchJson(`https://archive.org/metadata/${encodeURIComponent(d.identifier)}`, {}, 12000).catch(() => null)));

      const tracks = [];
      docs.forEach((doc, i) => {
        const files = (metas[i]?.files || [])
          .filter((f) => /\.mp3$/i.test(f.name) && /mp3/i.test(f.format || ''))
          .slice(0, 6);
        for (const f of files) {
          const path = f.name.split('/').map(encodeURIComponent).join('/');
          tracks.push({
            source: 'archive', id: `${doc.identifier}/${f.name}`, key: `archive:${doc.identifier}/${f.name}`,
            title: f.title || f.name.replace(/\.mp3$/i, '').replace(/_/g, ' '),
            artist: f.creator || (Array.isArray(doc.creator) ? doc.creator[0] : doc.creator) || doc.title || '',
            durationSec: parseDuration(f.length),
            cover: `https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`,
            raw: { url: `https://archive.org/download/${encodeURIComponent(doc.identifier)}/${path}` }
          });
        }
      });
      return tracks.slice(0, 30);
    },
    async resolve(track) {
      return { kind: 'file', url: track.raw.url };
    }
  };

  const PROVIDERS = [vk, bandcamp, zaycev, archive];
  const providerById = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

  // ------------------------------------------------------------ Яндекс Музыка

  async function fetchUserUid() {
    if (cachedUid) return cachedUid;
    try {
      const json = await fetchJson('https://api.music.yandex.ru/account/status', { headers: YM_HEADERS });
      const uid = json.result?.account?.uid;
      if (uid) return (cachedUid = String(uid));
    } catch (e) {
      console.warn(LOG, 'account/status', e);
    }
    cachedUid = document.cookie.match(/yandexuid=(\d+)/)?.[1] || null;
    return cachedUid;
  }

  async function requireUserUid() {
    const uid = await fetchUserUid();
    if (!uid) throw new Error('Не удалось определить аккаунт Яндекс Музыки. Войдите в аккаунт и попробуйте снова.');
    return uid;
  }

  async function loadUserPlaylists() {
    const uid = await fetchUserUid();
    if (!uid) return cachedPlaylists;
    try {
      const json = await fetchJson(`https://api.music.yandex.ru/users/${uid}/playlists/list`, { headers: YM_HEADERS });
      cachedPlaylists = (json.result || []).map((p) => ({
        kind: p.kind, title: p.title || 'Плейлист', trackCount: p.trackCount || 0
      }));
    } catch (e) {
      console.warn(LOG, 'playlists', e);
    }
    return cachedPlaylists;
  }

  // В «Мне нравится» загрузить напрямую нельзя: грузим в плейлист «Загруженное» и лайкаем
  async function getUploadPlaylistKind() {
    if (!cachedPlaylists.length) await loadUserPlaylists();
    const existing = cachedPlaylists.find((p) => p.title.toLowerCase() === 'загруженное');
    if (existing) return existing.kind;

    const uid = await requireUserUid();
    try {
      const fd = new FormData();
      fd.append('title', 'Загруженное');
      fd.append('visibility', 'private');
      const res = await fetchT(`https://api.music.yandex.ru/users/${uid}/playlists/create`, {
        method: 'POST', headers: YM_HEADERS, body: fd
      });
      if (res.ok) {
        const kind = (await res.json()).result?.kind;
        if (kind) {
          cachedPlaylists.unshift({ kind, title: 'Загруженное', trackCount: 0 });
          return kind;
        }
      }
    } catch (e) {
      console.warn(LOG, 'create playlist', e);
    }
    if (cachedPlaylists.length) return cachedPlaylists[0].kind;
    return 1000;
  }

  function xhrPost(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr)
        : reject(new Error(`Ошибка передачи файла в облако (${xhr.status})`)));
      xhr.onerror = () => reject(new Error('Сбой сети при загрузке в Яндекс Музыку'));
      xhr.send(formData);
    });
  }

  async function uploadToYandex(blob, filename, playlistKind, onProgress) {
    const uid = await requireUserUid();
    const cleanName = filename.replace(/[\/\\?%*:|"<>]/g, '').trim() || 'track.mp3';

    const slotRes = await fetchT(
      `https://api.music.yandex.ru/loader/upload-url?uid=${uid}&playlist-id=${uid}%3A${playlistKind}&path=${encodeURIComponent(cleanName)}`,
      { method: 'POST', headers: YM_HEADERS }
    );
    if (!slotRes.ok) {
      const body = await slotRes.text().catch(() => '');
      throw new Error(`Яндекс отклонил загрузку (${slotRes.status}) ${body.slice(0, 120)}`.trim());
    }
    const slot = await slotRes.json();
    const target = slot['post-target'];
    const ugcId = slot['ugc-track-id'];
    if (!target || !ugcId) throw new Error('Яндекс не выдал адрес загрузки');

    const fd = new FormData();
    fd.append('file', blob, cleanName);
    await xhrPost(target, fd, onProgress);

    const reg = new FormData();
    reg.append('trackIds', ugcId);
    reg.append('removeDuplicates', 'false');
    reg.append('withProgress', 'true');
    const regRes = await fetchT('https://api.music.yandex.ru/tracks', { method: 'POST', headers: YM_HEADERS, body: reg }, 30000);
    if (!regRes.ok) throw new Error(`Яндекс не принял трек (${regRes.status})`);
    return ugcId;
  }

  async function likeTrack(ugcId) {
    const uid = await requireUserUid();
    const res = await fetchT(`https://api.music.yandex.ru/users/${uid}/likes/tracks/add`, {
      method: 'POST',
      headers: { ...YM_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `track-ids=${encodeURIComponent(ugcId)}`
    });
    if (!res.ok) throw new Error(`Не удалось добавить в «Мне нравится» (${res.status})`);
  }

  // ------------------------------------------------------------ очередь загрузок

  const jobs = new Map();      // key -> { status, pct, dest, error }
  const trackIndex = new Map(); // key -> track
  const pending = [];
  let running = 0;

  function pump() {
    while (running < MAX_PARALLEL_JOBS && pending.length) {
      running++;
      pending.shift()();
    }
  }

  function enqueue(fn) {
    return new Promise((resolve, reject) => {
      pending.push(() => fn().then(resolve, reject).finally(() => { running--; pump(); }));
      pump();
    });
  }

  function setJob(key, patch) {
    jobs.set(key, { ...(jobs.get(key) || {}), ...patch });
    refreshActions(key);
  }

  async function acquireAudio(track, onProgress) {
    const provider = providerById[track.source];
    const stream = await provider.resolve(track);
    if (stream.kind === 'hls') return downloadHls(stream.url, onProgress);
    const blob = await fetchBlob(stream.url, onProgress);
    const type = blob.type || '';
    const ext = /mp4|m4a|aac/.test(type) ? (/aac$/.test(type) ? 'aac' : 'm4a') : 'mp3';
    return { blob, ext };
  }

  async function addTrack(track, dest) {
    const current = jobs.get(track.key);
    if (current && ['queue', 'download', 'upload'].includes(current.status)) return;
    setJob(track.key, { status: 'queue', pct: 0, dest: dest.title, error: null });

    await enqueue(async () => {
      let step = 'Скачивание';
      try {
        setJob(track.key, { status: 'download', pct: 0 });
        const { blob, ext } = await acquireAudio(track, (p) => setJob(track.key, { status: 'download', pct: p }));

        step = 'Загрузка в Яндекс Музыку';
        setJob(track.key, { status: 'upload', pct: 0 });
        const kind = dest.kind === 'likes' ? await getUploadPlaylistKind() : dest.kind;
        const name = `${track.artist ? track.artist + ' - ' : ''}${track.title}.${ext}`;
        const ugcId = await uploadToYandex(blob, name, kind, (p) => setJob(track.key, { status: 'upload', pct: p }));
        step = 'Добавление в «Мне нравится»';
        if (dest.kind === 'likes') await likeTrack(ugcId);

        setJob(track.key, { status: 'done', pct: 1 });
        notify(`«${track.title}» добавлен в «${dest.title}»`);
        loadUserPlaylists();
      } catch (e) {
        console.error(LOG, track.key, e);
        const msg = `${step}: ${e.message || 'сбой сети'}`;
        setJob(track.key, { status: 'error', error: msg });
        notify(`Не удалось добавить «${track.title}». ${msg}`, true);
      }
    });
  }

  // ------------------------------------------------------------ предпрослушивание

  let preview = null; // { key, audio, loading }

  // Громкость берём у плеера клиента, чтобы отрывок играл так же громко
  function appVolume() {
    try {
      const api = window.nextmusicApi;
      let v = api?.getState?.()?.volume;
      if (typeof v !== 'number') v = api?.getActiveAudioElement?.()?.volume;
      if (typeof v === 'number' && Number.isFinite(v)) return Math.min(1, Math.max(0, v > 1 ? v / 100 : v));
    } catch (e) {}
    return 0.5;
  }

  function stopPreview() {
    if (preview?.audio) { preview.audio.pause(); preview.audio.src = ''; }
    const key = preview?.key;
    preview = null;
    if (key) refreshPreviewState(key);
  }

  async function togglePreview(track) {
    if (preview?.key === track.key) return stopPreview();
    stopPreview();
    const mine = { key: track.key, audio: null, loading: true };
    preview = mine;
    refreshPreviewState(track.key);
    try {
      const stream = await providerById[track.source].resolve(track);
      if (preview !== mine) return;
      if (stream.kind !== 'file') throw new Error('Для этого источника предпрослушивание недоступно. Добавьте трек и слушайте в плеере.');
      try { window.nextmusicApi?.pause?.(); } catch (e) {}
      const audio = new Audio(stream.url);
      audio.volume = appVolume();
      audio.addEventListener('timeupdate', () => { audio.volume = appVolume(); });
      mine.audio = audio;
      audio.addEventListener('ended', () => { if (preview === mine) stopPreview(); });
      audio.addEventListener('error', () => { if (preview === mine) { stopPreview(); notify('Не удалось воспроизвести отрывок', true); } });
      await audio.play();
      mine.loading = false;
      refreshPreviewState(track.key);
    } catch (e) {
      if (preview === mine) { preview = null; refreshPreviewState(track.key); }
      notify(e.message || 'Не удалось воспроизвести отрывок', true);
    }
  }

  // ------------------------------------------------------------ состояние поиска

  const view = {
    source: loadSettings().source || 'all',
    query: '',
    results: new Map() // providerId -> { status: 'loading'|'ok'|'error', tracks, error, setup }
  };

  function activeProviders() {
    if (view.source !== 'all') return [providerById[view.source]].filter(Boolean);
    return PROVIDERS.filter((p) => !(p.needsSetup && p.needsSetup()));
  }

  function runSearch(query) {
    const seq = ++searchSeq;
    view.query = query;
    view.results = new Map();
    if (!query) return renderResults();

    const providers = activeProviders();
    providers.forEach((p) => view.results.set(p.id, { status: 'loading', tracks: [] }));
    renderResults();

    providers.forEach(async (p) => {
      let entry;
      try {
        const tracks = await p.search(query);
        tracks.forEach((t) => trackIndex.set(t.key, t));
        entry = { status: 'ok', tracks };
      } catch (e) {
        console.warn(LOG, p.id, e);
        entry = { status: 'error', tracks: [], error: e.message || 'Ошибка', setup: !!e.setup };
      }
      if (seq !== searchSeq) return;
      view.results.set(p.id, entry);
      renderResults();
    });
  }

  function mergedTracks() {
    const lists = [...view.results.values()].map((r) => r.tracks.slice());
    const out = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) {
      lists.forEach((l) => { if (l[i]) out.push(l[i]); });
    }
    return out;
  }

  // ------------------------------------------------------------ отрисовка

  function renderShell(container) {
    container.innerHTML = `
      <div class="nm-ext-header">
        <div>
          <h1 class="nm-ext-title">Сторонние треки</h1>
          <p class="nm-ext-subtitle">Найдите песню в другом сервисе и добавьте её в свою Яндекс Музыку</p>
        </div>
        <button type="button" class="nm-ext-icon-btn" data-act="settings" title="Подключения">${ICONS.gear}</button>
      </div>
      <div class="nm-ext-settings" hidden></div>
      <div class="nm-ext-search">
        <span class="nm-ext-search-icon">${ICONS.search}</span>
        <input type="text" class="nm-ext-input" placeholder="Название трека или исполнитель" spellcheck="false" />
        <button type="button" class="nm-ext-clear" data-act="clear" title="Очистить" hidden>&times;</button>
      </div>
      <div class="nm-ext-chips"></div>
      <div class="nm-ext-results"></div>
    `;
    renderChips();
    renderResults();
  }

  function renderChips() {
    const chips = viewEl.querySelector('.nm-ext-chips');
    const entries = [{ id: 'all', name: 'Все' }, ...PROVIDERS];
    chips.innerHTML = entries.map((p) => {
      const warn = p.needsSetup && p.needsSetup() ? '<span class="nm-ext-chip-dot" title="Нужен токен"></span>' : '';
      return `<button type="button" class="nm-ext-chip${view.source === p.id ? ' active' : ''}" data-act="source" data-id="${p.id}">${esc(p.name)}${warn}</button>`;
    }).join('');
  }

  function sourceNote(entry, provider) {
    if (entry.setup) {
      return `<div class="nm-ext-note">${esc(provider.name)}: ${esc(entry.error)}. <button type="button" class="nm-ext-link" data-act="settings">Подключить</button></div>`;
    }
    return `<div class="nm-ext-note nm-ext-note-err">${esc(provider.name)}: ${esc(entry.error)}</div>`;
  }

  function renderResults() {
    const box = viewEl?.querySelector('.nm-ext-results');
    if (!box) return;

    if (!view.query) {
      const hidden = PROVIDERS.filter((p) => p.needsSetup && p.needsSetup()).map((p) => p.name);
      box.innerHTML = `
        <div class="nm-ext-empty">
          <p class="nm-ext-empty-title">Что послушаем?</p>
          <p class="nm-ext-empty-text">Введите название трека или имя исполнителя. Поиск идёт сразу по всем источникам, выбранным выше.</p>
          ${view.source === 'all' && hidden.length ? `<p class="nm-ext-empty-text">${esc(hidden.join(', '))} не участвует в общем поиске: <button type="button" class="nm-ext-link" data-act="settings">подключить</button></p>` : ''}
        </div>`;
      return;
    }

    const entries = [...view.results.entries()];
    const loading = entries.some(([, r]) => r.status === 'loading');
    const tracks = mergedTracks();
    const notes = entries.filter(([, r]) => r.status === 'error').map(([id, r]) => sourceNote(r, providerById[id])).join('');

    let body;
    if (tracks.length) {
      body = `<div class="nm-ext-list">${tracks.map((t, i) => rowHtml(t, i)).join('')}</div>`;
    } else if (loading) {
      body = '<div class="nm-ext-empty"><div class="nm-ext-spinner"></div><p class="nm-ext-empty-text">Ищем…</p></div>';
    } else {
      body = `<div class="nm-ext-empty"><p class="nm-ext-empty-title">Ничего не нашлось</p><p class="nm-ext-empty-text">По запросу «${esc(view.query)}» нет результатов. Попробуйте другое написание или другой источник.</p></div>`;
    }

    const scroll = viewEl.scrollTop;
    box.innerHTML = `${loading && tracks.length ? '<div class="nm-ext-progress"></div>' : ''}${body}${notes}`;
    viewEl.scrollTop = scroll;
    if (preview) refreshPreviewState(preview.key);
  }

  function rowHtml(t, index) {
    const sourceName = providerById[t.source].name;
    return `
      <div class="nm-ext-row" data-key="${esc(t.key)}">
        <button type="button" class="nm-ext-cover" data-act="preview" title="Послушать отрывок">
          ${t.cover ? `<img src="${esc(t.cover)}" alt="" loading="lazy" />` : ''}
          <span class="nm-ext-cover-icon">${ICONS.play}</span>
        </button>
        <div class="nm-ext-meta">
          <span class="nm-ext-track-title" title="${esc(t.title)}">${esc(t.title)}</span>
          <span class="nm-ext-track-artist" title="${esc(t.artist)}">${esc(t.artist) || '&nbsp;'}</span>
        </div>
        <span class="nm-ext-source">${esc(sourceName)}</span>
        <span class="nm-ext-duration">${fmtDuration(t.durationSec)}</span>
        <div class="nm-ext-actions">${actionsHtml(t.key)}</div>
      </div>`;
  }

  function actionsHtml(key) {
    const job = jobs.get(key) || { status: 'idle' };
    const pct = Math.round((job.pct || 0) * 100);
    const spinner = '<span class="nm-ext-btn-spinner"></span>';
    switch (job.status) {
      case 'queue':
        return `<span class="nm-ext-status">${spinner}В очереди</span>`;
      case 'download':
        return `<span class="nm-ext-status">${spinner}Скачивание${pct ? ` ${pct}%` : ''}</span>`;
      case 'upload':
        return `<span class="nm-ext-status">${spinner}Загрузка${pct ? ` ${pct}%` : ''}</span>`;
      case 'done':
        return `<span class="nm-ext-status ok" title="Добавлено: ${esc(job.dest)}">${ICONS.check}В «${esc(job.dest)}»</span>`;
      case 'error':
        return `<span class="nm-ext-status err" title="${esc(job.error)}">${esc(job.error)}</span>
          <button type="button" class="nm-ext-icon-btn" data-act="retry" title="Повторить: ${esc(job.error)}">${ICONS.retry}</button>`;
      default:
        return `<button type="button" class="nm-ext-icon-btn nm-ext-like" data-act="like" title="Добавить в «Мне нравится»">${ICONS.heart}</button>
          <button type="button" class="nm-ext-icon-btn" data-act="menu" title="Добавить в плейлист">${ICONS.plus}</button>`;
    }
  }

  function refreshActions(key) {
    if (!viewEl) return;
    const row = viewEl.querySelector(`.nm-ext-row[data-key="${CSS.escape(key)}"]`);
    if (row) row.querySelector('.nm-ext-actions').innerHTML = actionsHtml(key);
  }

  function refreshPreviewState(key) {
    if (!viewEl) return;
    const row = viewEl.querySelector(`.nm-ext-row[data-key="${CSS.escape(key)}"]`);
    if (!row) return;
    const active = preview?.key === key;
    row.classList.toggle('previewing', active);
    row.querySelector('.nm-ext-cover').classList.toggle('loading', !!(active && preview.loading));
    row.querySelector('.nm-ext-cover-icon').innerHTML = active && !preview.loading ? ICONS.pause : ICONS.play;
  }

  // ------------------------------------------------------------ настройки VK

  function renderSettings() {
    const box = viewEl.querySelector('.nm-ext-settings');
    const token = loadSettings().vkToken || '';
    box.innerHTML = `
      <div class="nm-ext-card">
        <div class="nm-ext-card-head">
          <span class="nm-ext-card-title">VK</span>
          <span class="nm-ext-badge${token ? ' on' : ''}">${token ? 'Подключён' : 'Не подключён'}</span>
        </div>
        <ol class="nm-ext-steps">
          <li>Нажмите «Войти в VK» и разрешите доступ. Если токен подхватится сам, дальше ничего делать не нужно.</li>
          <li>Если после входа осталась пустая белая страница: нажмите <b>Ctrl+L</b>, затем <b>Ctrl+C</b>, чтобы скопировать весь адрес из адресной строки. Выбирать часть не нужно.</li>
          <li>Вставьте скопированное в поле ниже. Токен аддон вырежет из адреса сам.</li>
        </ol>
        <div class="nm-ext-field">
          <input type="password" class="nm-ext-input nm-ext-token" placeholder="Вставьте сюда адрес страницы или токен" spellcheck="false" value="${esc(token)}" />
        </div>
        <div class="nm-ext-card-actions">
          <button type="button" class="nm-ext-btn primary" data-act="vk-auth">Войти в VK</button>
          <button type="button" class="nm-ext-btn" data-act="vk-copy">Копировать ссылку для браузера</button>
          <button type="button" class="nm-ext-btn" data-act="vk-save">Проверить и сохранить</button>
          ${token ? '<button type="button" class="nm-ext-btn" data-act="vk-clear">Удалить</button>' : ''}
        </div>
        <p class="nm-ext-card-status" data-role="vk-status"></p>
        <p class="nm-ext-card-hint">Токен хранится только в локальном хранилище клиента и отправляется только на api.vk.com.
          Часть треков VK приходит в зашифрованном потоке — аддон расшифровывает его сам, это занимает несколько секунд.</p>
      </div>
      <p class="nm-ext-card-hint">Bandcamp, Zaycev и Internet Archive работают без настройки.</p>
    `;
  }

  // Достаёт токен из адреса вида ...#access_token=XXX&expires_in=0&user_id=1 или из голого токена
  function parseVkInput(raw) {
    const text = (raw || '').trim();
    if (!text) return { token: '' };
    const err = text.match(/error_description=([^&\s]+)/);
    if (err) return { token: '', error: decodeURIComponent(err[1].replace(/\+/g, ' ')) };
    const m = text.match(/access_token=([^&\s#]+)/);
    if (m) return { token: decodeURIComponent(m[1]) };
    if (/^[A-Za-z0-9._-]{20,}$/.test(text)) return { token: text };
    return { token: '', error: 'В этом тексте нет токена. Нужен адрес страницы после входа: в нём есть слово access_token.' };
  }

  function setVkStatus(text, kind = '') {
    const el = viewEl?.querySelector('[data-role="vk-status"]');
    if (!el) return;
    el.textContent = text;
    el.className = `nm-ext-card-status${kind ? ` ${kind}` : ''}`;
  }

  let vkAuthTimer = null;

  function openVkAuth() {
    clearInterval(vkAuthTimer);
    let win = null;
    try { win = window.open(VK_TOKEN_URL, 'nm-ext-vk-auth', 'width=560,height=760'); } catch (e) {}
    if (!win) {
      setVkStatus('Окно входа не открылось. Нажмите «Копировать ссылку для браузера», откройте её в обычном браузере и вставьте адрес страницы после входа в поле.', 'err');
      return;
    }
    setVkStatus('Войдите в VK в открывшемся окне и разрешите доступ…');
    const started = Date.now();
    vkAuthTimer = setInterval(() => {
      let href = '';
      try { href = win.location.href; } catch (e) { /* адрес чужого сайта недоступен */ }
      if (/access_token=/.test(href) || /error=/.test(href)) {
        clearInterval(vkAuthTimer);
        try { win.close(); } catch (e) {}
        const input = viewEl?.querySelector('.nm-ext-token');
        if (input) input.value = href;
        saveVkToken();
      } else if (win.closed || Date.now() - started > 5 * 60 * 1000) {
        clearInterval(vkAuthTimer);
        const input = viewEl?.querySelector('.nm-ext-token');
        if (!input?.value.trim()) setVkStatus('Окно закрыто. Если вы вошли, скопируйте адрес страницы (Ctrl+L, Ctrl+C) и вставьте в поле ниже.');
      }
    }, 700);
  }

  async function copyVkLink() {
    try {
      await navigator.clipboard.writeText(VK_TOKEN_URL);
      setVkStatus('Ссылка скопирована. Откройте её в браузере, войдите в VK, затем скопируйте адрес страницы после входа и вставьте в поле.', 'ok');
    } catch (e) {
      setVkStatus(`Не удалось скопировать. Откройте вручную: ${VK_TOKEN_URL}`, 'err');
    }
  }

  let vkSaving = false;

  async function saveVkToken() {
    if (vkSaving) return;
    const input = viewEl.querySelector('.nm-ext-token');
    const { token, error } = parseVkInput(input.value);
    if (!token) {
      setVkStatus(error || 'Вставьте адрес страницы после входа или токен.', 'err');
      return;
    }

    setVkStatus('Проверяем…');
    vkSaving = true;
    try {
      // Отклоняем токен только если VK прямо говорит, что он недействителен (код 5).
      // Flood control и прочие ограничения бывают и у рабочего токена: его всё равно сохраняем.
      let name = '';
      let warning = '';
      await vkProxyAvailable(true);
      try {
        const users = await vk.call('users.get', {}, token);
        name = [users?.[0]?.first_name, users?.[0]?.last_name].filter(Boolean).join(' ');
        await vk.call('audio.get', { count: 1 }, token);
      } catch (e) {
        if (e.code === 5) {
          setVkStatus('VK не принял токен. Скопируйте адрес страницы целиком, ничего не обрезая, и повторите. Если не помогает, нажмите «Войти в VK» ещё раз.', 'err');
          return;
        }
        warning = e.message;
      }
      saveSettings({ vkToken: token });
      notify(`VK подключён${name ? `: ${name}` : ''}`);
      renderSettings();
      renderChips();
      setVkStatus(warning
        ? `Токен сохранён, но поиск VK пока не работает: ${warning}.`
        : `Подключено${name ? `: ${name}` : ''}`, warning ? '' : 'ok');
      if (view.query && !warning) runSearch(view.query);
    } finally {
      vkSaving = false;
    }
  }

  function toggleSettings(force) {
    const box = viewEl.querySelector('.nm-ext-settings');
    const show = force ?? box.hidden;
    if (show) renderSettings();
    box.hidden = !show;
    viewEl.querySelector('[data-act="settings"].nm-ext-icon-btn')?.classList.toggle('active', show);
  }

  // ------------------------------------------------------------ меню плейлистов

  function closeMenu() {
    if (activeMenu) {
      activeMenu.overlay.remove();
      activeMenu.menu.remove();
      activeMenu = null;
    }
  }

  function openPlaylistMenu(anchor, track) {
    closeMenu();
    const overlay = document.createElement('div');
    overlay.className = 'nm-ext-overlay';
    const menu = document.createElement('div');
    menu.className = 'nm-ext-menu';

    const paint = () => {
      const items = cachedPlaylists.filter((p) => Number(p.kind) !== 3);
      menu.innerHTML = `
        <div class="nm-ext-menu-item primary" data-kind="likes" data-title="Мне нравится">Мне нравится</div>
        ${items.length ? '<div class="nm-ext-menu-divider"></div>' : ''}
        ${items.map((p) => `<div class="nm-ext-menu-item" data-kind="${esc(p.kind)}" data-title="${esc(p.title)}"><span>${esc(p.title)}</span><span class="nm-ext-menu-count">${p.trackCount}</span></div>`).join('')}`;
    };
    paint();

    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.nm-ext-menu-item');
      if (!item) return;
      closeMenu();
      addTrack(track, { kind: item.dataset.kind === 'likes' ? 'likes' : item.dataset.kind, title: item.dataset.title });
    });
    overlay.addEventListener('click', closeMenu);
    document.body.append(overlay, menu);

    const rect = anchor.getBoundingClientRect();
    const h = menu.offsetHeight;
    const top = rect.bottom + 4 + h > window.innerHeight ? Math.max(8, rect.top - h - 4) : rect.bottom + 4;
    menu.style.top = `${top}px`;
    menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    activeMenu = { overlay, menu };

    loadUserPlaylists().then(() => { if (activeMenu?.menu === menu) paint(); });
  }

  // ------------------------------------------------------------ вкладка

  // Вкладка рисуется поверх области контента, а не внутри неё: React перерисовывает
  // содержимое страницы и выбрасывает чужие узлы.
  const ACTIVE_RE = /active|selected|current/i;
  let deactivated = [];

  function findContentArea() {
    const main = document.querySelector('main, [class*="Content_main"], [class*="MainLayout_main"]');
    if (main && main.getBoundingClientRect().width > 200) return main;
    return null;
  }

  function contentRect() {
    const main = findContentArea();
    if (main) return main.getBoundingClientRect();
    const aside = document.querySelector('aside');
    const left = aside ? aside.getBoundingClientRect().right : 240;
    const top = aside ? aside.getBoundingClientRect().top : 48;
    return { left, top, width: window.innerWidth - left, height: window.innerHeight - top - 90 };
  }

  function solidBackground() {
    let el = findContentArea();
    while (el) {
      const c = getComputedStyle(el).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
      el = el.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || '#121212';
  }

  let coveredEl = null;

  function positionView() {
    if (!viewEl || !isTabActive) return;
    const main = findContentArea();
    // ставим сразу после main: в общем слое с ним, под плеером, меню и окнами
    if (main?.parentElement && viewEl.previousElementSibling !== main) main.after(viewEl);
    else if (!viewEl.isConnected) document.body.appendChild(viewEl);
    const r = contentRect();
    const cs = main ? getComputedStyle(main) : null;
    if (main && main !== coveredEl) {
      coveredEl?.classList.remove('nm-ext-covered');
      coveredEl = main;
    }
    coveredEl?.classList.add('nm-ext-covered');
    Object.assign(viewEl.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      borderRadius: cs?.borderRadius && cs.borderRadius !== '0px' ? cs.borderRadius : '12px',
      background: solidBackground()
    });
  }

  const nativeItems = (ol) => [...ol.children].filter((li) => li.tagName === 'LI' && !li.classList.contains('nm-ext-nav-item') && li.querySelector('a'));

  // Классы ЯМ минифицированы, поэтому «активные» ищем сравнением пунктов между собой:
  // класс, который есть у узла только одного пункта (в той же позиции), — признак выделения
  function activeTokensMap(ol) {
    const items = nativeItems(ol);
    const map = new Map();
    if (items.length < 3) return map;
    const counts = new Map();
    const nodes = [];
    items.forEach((li) => {
      [li, ...li.querySelectorAll('*')].forEach((el) => {
        const path = el === li ? '' : pathOf(el, li).join('/');
        nodes.push({ el, path });
        new Set(el.classList).forEach((c) => {
          const k = `${path}|${c}`;
          counts.set(k, (counts.get(k) || 0) + 1);
        });
      });
    });
    nodes.forEach(({ el, path }) => {
      const tokens = [...el.classList].filter((c) => !c.startsWith('nm-ext') && (ACTIVE_RE.test(c) || counts.get(`${path}|${c}`) === 1));
      if (tokens.length) map.set(el, tokens);
    });
    return map;
  }

  function pathOf(el, li) {
    const path = [];
    for (let n = el; n && n !== li; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n));
    return path;
  }

  let transferred = [];
  const isCurrent = (el) => { const v = el.getAttribute('aria-current'); return !!v && v !== 'false'; };

  function setNativeActive(on) {
    const ol = navItemEl?.parentElement;
    if (!ol) return;
    if (on) {
      deactivated = [];
      transferred = [];
      const map = activeTokensMap(ol);
      ol.querySelectorAll('*').forEach((el) => {
        if (navItemEl.contains(el)) return;
        const tokens = map.get(el) || [];
        const current = isCurrent(el) ? el.getAttribute('aria-current') : null;
        if (tokens.length || current) {
          deactivated.push({ el, tokens, current });
          tokens.forEach((t) => el.classList.remove(t));
          if (current) el.removeAttribute('aria-current');
        }
      });
      // то же состояние переносим на свой пункт по той же структурной позиции
      const refLi = deactivated.map((d) => d.el.closest('li')).find(Boolean);
      deactivated.forEach((d) => {
        const li = d.el.closest('li');
        if (!li || li !== refLi) return;
        let target = navItemEl;
        if (d.el !== li) for (const idx of pathOf(d.el, li)) target = target?.children[idx];
        if (!target) return;
        const added = d.tokens.filter((t) => !target.classList.contains(t));
        added.forEach((t) => target.classList.add(t));
        transferred.push({ el: target, tokens: added });
        if (d.current) target.setAttribute('aria-current', d.current);
      });
    } else {
      transferred.forEach(({ el, tokens }) => tokens.forEach((t) => el.classList.remove(t)));
      transferred = [];
      [navItemEl, ...navItemEl.querySelectorAll('*')].forEach((el) => el.removeAttribute('aria-current'));
      deactivated.forEach(({ el, tokens, current }) => {
        tokens.forEach((t) => el.classList.add(t));
        if (current) el.setAttribute('aria-current', current);
      });
      deactivated = [];
    }
  }

  function setViewActive(active) {
    if (active === isTabActive) { if (active) positionView(); return; }
    isTabActive = active;
    if (active) {
      ensureViewMounted();
      if (!viewEl) { isTabActive = false; return; }
      setNativeActive(true);
      viewEl.style.display = 'flex';
      positionView();
      viewEl.querySelector('.nm-ext-input')?.focus();
    } else {
      setNativeActive(false);
      if (viewEl) viewEl.style.display = 'none';
      coveredEl?.classList.remove('nm-ext-covered');
      coveredEl = null;
      closeMenu();
      stopPreview();
    }
  }

  // Пункт сайдбара — копия нативного: те же классы, структура и размер иконки
  function injectSidebarItem() {
    if (isDisposed || (navItemEl && navItemEl.isConnected)) return;
    const ol = document.querySelector('aside ol, [class*="NavbarDesktop_navigation"] > ol');
    if (!ol) return;

    const items = nativeItems(ol);
    const map = activeTokensMap(ol);
    const isActive = (li) => [li, ...li.querySelectorAll('*')].some((el) => isCurrent(el) || map.has(el));
    const refLi = items.find((li) => li.querySelector('a[href="/collection"]') && !isActive(li)) || items.find((li) => !isActive(li)) || items[0];
    if (!refLi) return;

    const li = refLi.cloneNode(true);
    li.classList.add('nm-ext-nav-item');
    const refNodes = [refLi, ...refLi.querySelectorAll('*')];
    [li, ...li.querySelectorAll('*')].forEach((el, i) => {
      (map.get(refNodes[i]) || []).forEach((c) => el.classList.remove(c));
      el.removeAttribute('aria-current');
      el.removeAttribute('id');
    });

    const link = li.querySelector('a');
    link.setAttribute('href', '#');
    link.classList.add('nm-ext-nav-link');
    link.removeAttribute('target');

    // Иконка: своя, того же размера, что у нативной
    const oldSvg = link.querySelector('svg');
    const size = parseInt(oldSvg?.getAttribute('width') || oldSvg?.getBoundingClientRect().width || 24, 10) || 24;
    const holder = document.createElement('div');
    holder.innerHTML = ICONS.cloud.replace('width="22" height="22"', `width="${size}" height="${size}"`);
    const svg = holder.firstElementChild;
    if (oldSvg) {
      if (oldSvg.getAttribute('class')) svg.setAttribute('class', oldSvg.getAttribute('class'));
      oldSvg.replaceWith(svg);
    } else {
      link.insertBefore(svg, link.firstChild);
    }

    // Подпись: меняем текст в том же узле, где он был
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) textNodes.push(walker.currentNode);
    if (textNodes.length) {
      textNodes[0].nodeValue = 'Сторонние треки';
      textNodes.slice(1).forEach((n) => { n.nodeValue = ''; });
    } else {
      const span = document.createElement('span');
      span.textContent = 'Сторонние треки';
      link.appendChild(span);
    }
    link.querySelectorAll('[title]').forEach((el) => el.setAttribute('title', 'Сторонние треки'));
    link.setAttribute('aria-label', 'Сторонние треки');

    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      setViewActive(true);
    });

    navItemEl = li;
    ol.appendChild(li);
    if (isTabActive) setNativeActive(true);
  }

  function ensureViewMounted() {
    if (viewEl && viewEl.isConnected) return;
    document.getElementById('nm-ext-sources-view')?.remove();
    viewEl = document.createElement('div');
    viewEl.id = 'nm-ext-sources-view';
    (findContentArea()?.parentElement || document.body).appendChild(viewEl);
    renderShell(viewEl);
    bindView(viewEl);
  }

  function bindView(root) {
    const input = root.querySelector('.nm-ext-input');
    const clearBtn = root.querySelector('.nm-ext-clear');

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearBtn.hidden = !q;
      clearTimeout(searchTimer);
      if (!q) return runSearch('');
      searchTimer = setTimeout(() => runSearch(q), 400);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(input.value.trim()); }
      if (e.key === 'Escape') { input.value = ''; clearBtn.hidden = true; runSearch(''); }
    });

    root.addEventListener('input', (e) => {
      if (!e.target.classList.contains('nm-ext-token')) return;
      const { token, error } = parseVkInput(e.target.value);
      if (!e.target.value.trim()) setVkStatus('');
      else if (token) setVkStatus(`Токен найден (${token.length} символов). Нажмите «Проверить и сохранить».`, 'ok');
      else setVkStatus(error, 'err');
    });

    root.addEventListener('error', (e) => {
      if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden';
    }, true);

    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || !root.contains(btn)) return;
      const act = btn.dataset.act;
      const row = btn.closest('.nm-ext-row');
      const track = row ? trackIndex.get(row.dataset.key) : null;

      switch (act) {
        case 'clear':
          input.value = '';
          clearBtn.hidden = true;
          input.focus();
          runSearch('');
          break;
        case 'source':
          view.source = btn.dataset.id;
          saveSettings({ source: view.source });
          renderChips();
          if (view.source === 'vk' && providerById.vk.needsSetup()) toggleSettings(true);
          if (view.query) runSearch(view.query); else renderResults();
          break;
        case 'settings':
          toggleSettings();
          break;
        case 'vk-auth':
          openVkAuth();
          break;
        case 'vk-copy':
          copyVkLink();
          break;
        case 'vk-save':
          saveVkToken();
          break;
        case 'vk-clear':
          saveSettings({ vkToken: '' });
          renderSettings();
          renderChips();
          if (view.query) runSearch(view.query); else renderResults();
          break;
        case 'preview':
          if (track) togglePreview(track);
          break;
        case 'like':
        case 'retry':
          if (track) addTrack(track, { kind: 'likes', title: 'Мне нравится' });
          break;
        case 'menu':
          if (track) openPlaylistMenu(btn, track);
          break;
      }
    });
  }

  // ------------------------------------------------------------ жизненный цикл

  function init() {
    loadUserPlaylists();

    const origPush = history.pushState;
    const leave = () => { if (isTabActive) setViewActive(false); };
    let lastPath = location.pathname + location.search;
    history.pushState = function () {
      const r = origPush.apply(this, arguments);
      const now = location.pathname + location.search;
      if (now !== lastPath) leave();
      lastPath = now;
      return r;
    };
    window.addEventListener('popstate', leave);

    const onDocClick = (e) => {
      const link = e.target.closest('aside a, [class*="Navbar"] a');
      if (link && !link.classList.contains('nm-ext-nav-link')) leave();
    };
    document.addEventListener('click', onDocClick, true);
    window.addEventListener('resize', positionView);

    injectSidebarItem();
    const timer = setInterval(() => {
      if (isDisposed) return clearInterval(timer);
      injectSidebarItem();
      positionView();
    }, 600);

    window.__externalSourcesAddon = {
      dispose() {
        isDisposed = true;
        clearInterval(timer);
        clearTimeout(searchTimer);
        history.pushState = origPush;
        window.removeEventListener('popstate', leave);
        window.removeEventListener('resize', positionView);
        document.removeEventListener('click', onDocClick, true);
        closeMenu();
        stopPreview();
        clearInterval(vkAuthTimer);
        document.getElementById('nm-ext-toast')?.remove();
        if (isTabActive) setNativeActive(false);
        navItemEl?.remove();
        viewEl?.remove();
      }
    };
    console.log(LOG, 'ready');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

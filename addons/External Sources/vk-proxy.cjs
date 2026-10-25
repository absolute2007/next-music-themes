// Фоновый прокси для API VK: пересылает запросы на api.vk.com с User-Agent Kate Mobile.
// Без этого заголовка VK отвечает на audio.* ошибкой «Unknown method passed», а страница
// в Next Music подменить User-Agent не может. Слушает только 127.0.0.1.
// Запуск: ELECTRON_RUN_AS_NODE=1 "Next Music.exe" vk-proxy.cjs (так делает vk-proxy.vbs)

const http = require('http');
const https = require('https');

const PORT = 2008;
const VERSION = 1;
const USER_AGENT = 'KateMobileAndroid/56 lite-460 (Android 4.4.2; SDK 19; x86; unknown Android SDK built for x86; en)';
const ALLOWED_ORIGINS = /^https:\/\/([a-z0-9-]+\.)*music\.yandex\.(ru|com|by|kz|uz)$/;

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Vary', 'Origin');
  }
  return !origin || ALLOWED_ORIGINS.test(origin);
}

const server = http.createServer((req, res) => {
  if (!cors(req, res)) { res.writeHead(403); return res.end(); }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, name: 'nm-vk-proxy', version: VERSION }));
  }
  if (!/^\/method\/[\w.]+$/.test(url.pathname)) { res.writeHead(404); return res.end(); }

  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const upstream = https.request({
      host: 'api.vk.com',
      path: url.pathname + url.search,
      method: req.method === 'POST' ? 'POST' : 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        ...(body.length ? { 'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded', 'Content-Length': body.length } : {})
      },
      timeout: 15000
    }, (up) => {
      res.writeHead(up.statusCode || 502, { 'Content-Type': up.headers['content-type'] || 'application/json' });
      up.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', (e) => {
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { error_code: -1, error_msg: `Прокси не достучался до VK: ${e.message}` } }));
    });
    upstream.end(body);
  });
});

// Уже запущен другой экземпляр — тихо выходим
server.on('error', (e) => process.exit(e.code === 'EADDRINUSE' ? 0 : 1));
server.listen(PORT, '127.0.0.1');

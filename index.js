const http = require('http');
const https = require('https');
const { URL } = require('url');

const TARGET_DOMAIN = process.env.TARGET_DOMAIN;
const PORT = process.env.PORT || 3000;

const STRIP_HEADERS = new Set([
  'host', 'connection', 'keep-alive', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer', 'transfer-encoding',
  'upgrade', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto',
  'x-forwarded-port'
]);

const server = http.createServer((req, res) => {
  try {
    if (!TARGET_DOMAIN) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('TARGET_DOMAIN is not set!');
      return;
    }

    const targetUrl = new URL(req.url, TARGET_DOMAIN);

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers: {}
    };

    let clientIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'];

    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (STRIP_HEADERS.has(lower) || lower.startsWith('x-vercel-') || lower.startsWith('x-northflank-')) continue;
      options.headers[key] = value;
    }

    if (clientIp) options.headers['x-forwarded-for'] = clientIp;

    const proxyReq = (targetUrl.protocol === 'https:' ? https : http).request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', () => {
      res.writeHead(502);
      res.end('Bad Gateway');
    });

    req.pipe(proxyReq);

  } catch (err) {
    res.writeHead(502);
    res.end('Bad Gateway');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`XHTTP Relay running on port ${PORT} → ${TARGET_DOMAIN}`);
});
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const OHGO_API_KEY = process.env.OHGO_API_KEY || '';
const RADIO_GAP_SECONDS = Number(process.env.RADIO_GAP_SECONDS || 30);
const ALLOW = new Set(['index.html','app.js','styles.css']);
const TILE_UA = 'radio-camera-bridge/1.0 (contact: example@example.com)';

let lastCall = null;
const clients = new Set();

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'text/plain', ...headers });
  res.end(body);
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ lastCall, gapSeconds: RADIO_GAP_SECONDS }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'init', lastCall })}\n\n`);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/radio-call') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try { lastCall = JSON.parse(body); } catch { lastCall = { raw: body }; }
      lastCall.receivedAt = Date.now();
      const msg = `data: ${JSON.stringify({ type: 'call', call: lastCall })}\n\n`;
      for (const c of clients) try { c.write(msg); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/cameras') {
    if (!OHGO_API_KEY) { send(res, 500, 'missing key'); return; }
    try {
      const r = await fetch(`https://publicapi.ohgo.com/api/v1/cameras?api-key=${OHGO_API_KEY}`);
      const txt = await r.text();
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
      res.end(txt);
    } catch (e) { send(res, 502, String(e)); }
    return;
  }
  // tile proxy: /tile/:z/:x/:y -> OSM
  const tileMatch = url.pathname.match(/^\/tile\/(\d+)\/(\d+)\/(\d+)$/);
  if (req.method === 'GET' && tileMatch) {
    const z = Number(tileMatch[1]);
    const x = Number(tileMatch[2]);
    const y = Number(tileMatch[3]);
    const upstreamUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
    let upstream;
    try {
      upstream = await fetch(upstreamUrl, { headers: { 'User-Agent': TILE_UA } });
    } catch (e) {
      send(res, 502, 'tile upstream error');
      return;
    }
    if (!upstream.ok || !upstream.body) {
      send(res, upstream.status || 502, 'tile error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400',
    });
    try {
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (e) {
      res.destroy();
    }
    return;
  }
  // static allow-list
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (ALLOW.has(name)) {
    const fp = path.join(__dirname, name);
    const ct = name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'application/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(fs.readFileSync(fp));
    return;
  }
  send(res, 404, 'not found');
});

server.listen(PORT, () => console.log('bridge on', PORT));

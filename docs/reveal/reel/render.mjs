// Renders reel.html frame by frame in headless Edge and encodes it with ffmpeg.
//
//   node render.mjs stills 0.5 2.4 7.9      → PNG stills in ./out for review
//   node render.mjs video [--fps 60] [--sub 3] [--out file.mp4]
//
// Motion blur comes from temporal supersampling: each output frame is the average
// of --sub subframes spread across a 180° shutter. No npm dependencies: Node's
// built-in WebSocket speaks the DevTools protocol, and a small static server
// serves the repository so fonts and images load over http.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const args = process.argv.slice(2);
const mode = args[0] || 'video';
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };

const edgeCore = 'C:/Program Files (x86)/Microsoft/EdgeCore';
const EDGE = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ...(existsSync(edgeCore) ? readdirSync(edgeCore).sort().reverse().map(v => `${edgeCore}/${v}/msedge.exe`) : []),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find(p => p && existsSync(p));

// ---- static server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = resolve(repo, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(repo)) throw new Error('outside');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

// ---- browser
const profile = await mkdtemp(join(tmpdir(), 'reel-edge-'));
const browser = spawn(EDGE, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=1', '--window-size=1920,1080', '--force-color-profile=srgb',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  browser.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  setTimeout(() => rej(new Error('browser did not start')), 20000);
});

const ws = new WebSocket(wsUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 0; const pending = new Map();
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const [res, rej] = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, [res, rej]); ws.send(JSON.stringify({ id, method, params, sessionId })); });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable');
await S('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await S('Page.navigate', { url: `http://127.0.0.1:${port}/docs/reveal/reel/reel.html?render` });
const evaluate = async (expression) => {
  const r = await S('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
for (let i = 0; i < 100; i++) { try { if (await evaluate('!!window.ready')) break; } catch { } await new Promise(r => setTimeout(r, 100)); }
await evaluate('window.ready');
const shot = async (t, format = 'png') => {
  await evaluate(`render(${t}); 0`);
  const { data } = await S('Page.captureScreenshot', { format, quality: 95, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 }, optimizeForSpeed: true });
  return Buffer.from(data, 'base64');
};

try {
  if (mode === 'bench') {
    for (const fmt of ['png', 'jpeg']) { const t0 = Date.now(); for (let i = 0; i < 20; i++) { await evaluate('render(' + (5 + i * .05) + '); 0'); await S('Page.captureScreenshot', { format: fmt, quality: 95, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 }, optimizeForSpeed: true }); } console.log(fmt, (Date.now() - t0) / 20, 'ms/frame'); }
    const t1 = Date.now(); for (let i = 0; i < 20; i++) await evaluate('render(' + (5 + i * .05) + '); 0'); console.log('render only', (Date.now() - t1) / 20);
  } else if (mode === 'eval') {
    console.log(JSON.stringify(await evaluate(args[1]), null, 1));
  } else if (mode === 'stills') {
    const out = join(here, 'out');
    await mkdir(out, { recursive: true });
    for (const a of args.slice(1).filter(a => !a.startsWith('--'))) {
      const t = parseFloat(a);
      await shot(t); // warm
      await writeFile(join(out, `still-${t.toFixed(2)}.png`), await shot(t));
      console.log('still', t);
    }
  } else {
    const fps = +opt('fps', 60), sub = +opt('sub', 3), shutter = +opt('shutter', .5), fmt = opt('format', 'png');
    const dur = await evaluate('window.DUR');
    const outFile = resolve(here, opt('out', 'out/reel-silent.mp4'));
    await mkdir(dirname(outFile), { recursive: true });
    const frames = Math.round(dur * fps);
    const vf = sub > 1
      ? `tmix=frames=${sub},select='eq(mod(n\\,${sub})\\,${sub - 1})',setpts=N/(${fps}*TB)`
      : 'null';
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps * sub), '-c:v', fmt === 'png' ? 'png' : 'mjpeg', '-i', '-',
      '-vf', vf, '-r', String(fps), '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise(r => ff.on('close', r));
    const started = Date.now();
    for (let f = 0; f < frames; f++) {
      for (let j = 0; j < sub; j++) {
        const off = sub > 1 ? (j / (sub - 1) - .5) * shutter : 0;
        const t = Math.min(dur - 1e-4, Math.max(0, (f + off) / fps));
        const png = await shot(t, fmt);
        if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
      }
      if (f % 30 === 0) {
        const el = (Date.now() - started) / 1000;
        process.stdout.write(`frame ${f}/${frames}  ${el.toFixed(0)}s elapsed, ~${(el / (f + 1) * (frames - f - 1)).toFixed(0)}s left\n`);
      }
    }
    ff.stdin.end();
    await done;
    console.log('wrote', outFile);
  }
} finally {
  ws.close(); browser.kill(); server.close();
  await new Promise(r => setTimeout(r, 500));
  await rm(profile, { recursive: true, force: true }).catch(() => { });
}

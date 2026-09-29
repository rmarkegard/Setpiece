// Usage: start Setpiece with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9400, launch a
// workspace with a browser named "Media" (Twitch and YouTube tabs open), then: node tools/playback-bench.js [seconds] [twitch].
// Close Setpiece and start it normally afterwards: the debugging port gives local programs control of its pages.
// Playback benchmark for Setpiece's browser (WebView2 remote debugging on 9400).
// Each scenario samples the playing <video> every 250 ms: frames decoded per second, dropped frames,
// stalls (a second in which playback advanced under half a second) and long page frames (> 50 ms).
const PORT = 9400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() { return (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); }
async function connect(match) {
  const t = (await targets()).find((x) => x.type === 'page' && x.url.includes(match));
  if (!t) throw new Error('no page ' + match);
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({id: n, method, params})); });
  const evaluate = async (expression, userGesture = false) => { const d = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true, userGesture}); if (d.result?.exceptionDetails) throw new Error(d.result.exceptionDetails.exception?.description ?? 'eval failed'); return d.result?.result?.value; };
  return {send, evaluate, close: () => ws.close()};
}
async function toolbar(payload) {
  const t = await connect('browser=Media');
  const r = await t.evaluate(`new Promise(r=>{const id=Math.floor(Math.random()*1e9);const f=e=>{if(e.data.id===id){window.chrome.webview.removeEventListener('message',f);r(e.data.result)}};window.chrome.webview.addEventListener('message',f);window.chrome.webview.postMessage({id,command:'browser',payload:${JSON.stringify(payload)}});})`);
  t.close(); return r;
}
async function measure(match, seconds, during) {
  const tab = await connect(match);
  await tab.evaluate(`(()=>{window.__bench={s:[],long:0,maxGap:0};let last=performance.now();const tick=t=>{const g=t-last;last=t;if(g>50)window.__bench.long++;if(g>window.__bench.maxGap)window.__bench.maxGap=g;if(window.__bench)requestAnimationFrame(tick)};requestAnimationFrame(tick);
    window.__benchTimer=setInterval(()=>{const v=document.querySelector('video');if(!v)return;const q=v.getVideoPlaybackQuality();window.__bench.s.push([performance.now(),v.currentTime,q.totalVideoFrames,q.droppedVideoFrames,v.paused?1:0,v.readyState])},250);return 1})()`);
  const stop = during ? during() : null;
  await sleep(seconds * 1000);
  if (stop) await stop();
  const raw = await tab.evaluate(`(()=>{clearInterval(window.__benchTimer);const b=window.__bench;window.__bench=null;return JSON.stringify(b)})()`);
  tab.close();
  const b = JSON.parse(raw); const s = b.s;
  const perSecond = [], advance = [];
  for (let i = 4; i < s.length; i += 4) { perSecond.push(s[i][2] - s[i - 4][2]); let a = s[i][1] - s[i - 4][1]; if (a < -1) a = 1; advance.push(a); }
  const sorted = [...perSecond].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
  return {
    median, avg: +(perSecond.reduce((a, b) => a + b, 0) / Math.max(1, perSecond.length)).toFixed(1), worst: sorted[0] ?? 0,
    slowSeconds: perSecond.filter((f) => f < median * 0.9).length, stalls: advance.filter((a) => a < 0.5).length, seconds: perSecond.length,
    dropped: s.length ? s[s.length - 1][3] - s[0][3] : 0, longFrames: b.long, maxGapMs: Math.round(b.maxGap), paused: s.some((x) => x[4]),
  };
}
async function play(match) { const t = await connect(match); const r = await t.evaluate(`(()=>{const v=document.querySelector('video');if(!v)return 'no video';window.__restore={paused:v.paused,muted:v.muted,loop:v.loop};v.muted=true;v.loop=true;v.play();return 'ok'})()`, true); t.close(); return r; }
async function restore(match) { const t = await connect(match); await t.evaluate(`(()=>{const v=document.querySelector('video');const r=window.__restore;if(v&&r){if(r.paused)v.pause();v.muted=r.muted;v.loop=r.loop}if(document.fullscreenElement)document.exitFullscreen();return 1})()`, true); t.close(); }
async function fullscreen(match, on) { const t = await connect(match); await t.evaluate(on ? `document.querySelector('video').requestFullscreen().then(()=>1,e=>e.message)` : `document.fullscreenElement?document.exitFullscreen().then(()=>1):1`, true); t.close(); }
// Moves the pointer across the widgets on the desk every 60 ms (hover states, the actions overlay).
function hoverDesk() {
  let running = true; const loop = (async () => {
    const d = await connect('?workspace=0'); let x = 0;
    while (running) { x = (x + 37) % 1900; await d.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y: 200 + (x % 700)}); await sleep(60); }
    d.close();
  })();
  return async () => { running = false; await loop; };
}
module.exports = {measure, play, restore, fullscreen, toolbar, hoverDesk, connect, targets, sleep};

if (require.main === module) (async () => {
  const seconds = Number(process.argv[2] || 20);
  const clip = 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/1080/Big_Buck_Bunny_1080_10s_30MB.mp4';
  const state = await toolbar({action: 'state'}); const original = state.selected;
  const added = await toolbar({action: 'add', url: clip}); const mine = added.selected; await toolbar({action: 'navigate', url: clip}); await sleep(5000);
  const rows = [];
  const run = async (label, match, opts = {}) => {
    const tab = (await toolbar({action: 'state'})).tabs.find((t) => t.url.includes(match.replace(/^https?:\/\//, '')) || t.url.includes(match));
    if (tab) await toolbar({action: 'select', id: tab.id});
    await sleep(2500); await play(match); await sleep(2000);
    if (opts.fullscreen) { await fullscreen(match, true); await sleep(2000); }
    const r = await measure(match, seconds, opts.hover ? hoverDesk : null);
    if (opts.fullscreen) { await fullscreen(match, false); await sleep(1000); }
    await restore(match);
    rows.push({label, ...r}); console.log(label.padEnd(34), JSON.stringify(r));
  };
  try {
    if (process.argv[3] === 'twitch') { for (let i = 1; i <= 3; i++) await run('twitch live · run ' + i, 'twitch.tv'); return; }
    await run('clip 1080p30 · tile', 'Big_Buck_Bunny');
    await run('clip 1080p30 · tile · hover desk', 'Big_Buck_Bunny', {hover: true});
    await run('clip 1080p30 · full display', 'Big_Buck_Bunny', {fullscreen: true});
    await run('twitch live · tile', 'twitch.tv');
    await run('twitch live · tile · hover desk', 'twitch.tv', {hover: true});
    await run('youtube · tile', 'youtube.com/watch');
    await run('youtube · full display', 'youtube.com/watch', {fullscreen: true});
  } finally {
    const s = await toolbar({action: 'state'});
    for (const t of s.tabs.filter((t) => t.id === mine || t.url.includes('test-videos') || t.url === 'https://www.google.com/')) await toolbar({action: 'close', id: t.id});
    if (original) await toolbar({action: 'select', id: original});
  }
  require('fs').writeFileSync(require('path').join(__dirname, '..', 'artifacts', 'playback-bench.json'), JSON.stringify(rows, null, 1));
})();

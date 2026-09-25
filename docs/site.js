'use strict';
const root = document.documentElement;
const systemLight = matchMedia('(prefers-color-scheme: light)');
const theme = () => root.dataset.theme || (systemLight.matches ? 'light' : 'dark');

/* Theme toggle. Themed screenshots follow via CSS (.only-dark / .only-light) and refreshThemed(). */
const toggle = document.querySelector('#theme-toggle');
function paintToggle() {
  const next = theme() === 'dark' ? 'light' : 'dark';
  toggle.querySelector('.ms').textContent = next + '_mode';
  toggle.setAttribute('aria-label', 'Switch to ' + next + ' theme');
}
toggle.addEventListener('click', () => {
  root.dataset.theme = theme() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('setpiece-site-theme', root.dataset.theme); } catch {}
  paintToggle(); refreshThemed();
});
systemLight.addEventListener('change', () => { if (!root.dataset.theme) { paintToggle(); refreshThemed(); } });
paintToggle();

/* Tour */
const shots = {
  studio: ['Studio. Pick a display, start from a layout, then drag, resize and split tiles on a live board. Widgets render for real while you arrange them.', 'Setpiece Studio: displays, the layout board with live widgets, and the tile inspector.', 960],
  widgets: ['Widgets. The library shows what each widget needs, what’s connected, and how many are on this display. Add one in a click.', 'The Setpiece widget library with category filters, setup status and Add buttons.', 1320],
  dialog: ['Setup. Every widget opens the same way: a live preview on the left, its settings and connection on the right.', 'The Spotify widget dialog, with a live preview next to its connection settings.', 780],
  browsers: ['Browsers. Name a browser once, open it anywhere, or put it in the selected tile. Brave bookmarks come along.', 'The Browsers page with two named browsers, the edit form and Brave bookmarks.', 760],
  appearance: ['Appearance. Light or dark, your accent, surfaces and corners, and a wallpaper per workspace, with a live preview.', 'The Appearance page with mode, accent swatches, surface sliders and a live preview.', 1180],
  settings: ['Settings. Interface and text size, reduced motion, workspaces, updates and shortcuts, as plain rows.', 'The Settings page with comfort, workspaces, updates and keyboard sections.', 1260]
};
const tabs = [...document.querySelectorAll('[data-shot]')];
const tourImage = document.querySelector('#tour-image');
function showShot(tab) {
  const name = tab.dataset.shot, [caption, alt, height] = shots[name];
  tourImage.dataset.name = name;
  tourImage.alt = alt;
  tourImage.height = height;
  document.querySelector('#tour-caption').textContent = caption;
  document.querySelector('#tour-panel').setAttribute('aria-labelledby', tab.id);
  tabs.forEach(t => { t.setAttribute('aria-selected', String(t === tab)); t.tabIndex = t === tab ? 0 : -1; });
  refreshThemed();
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => showShot(tab));
  tab.addEventListener('keydown', e => {
    const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (next !== undefined) { e.preventDefault(); showShot(tabs[next]); tabs[next].focus(); }
  });
});

/* Widget wall: every widget in both themes. */
const widgets = [
  ['clock', 'Clock', 300], ['google-calendar', 'Calendar', 420], ['spotify', 'Spotify', 300], ['system', 'System', 300],
  ['weather', 'Weather', 300], ['discord', 'Discord', 300], ['bambu-lab', 'Bambu Lab', 420], ['ruter', 'Ruter', 300],
  ['email', 'Inbox', 300], ['codex', 'AI Usage', 300], ['idle-game', 'Scrapbots', 300], ['news', 'VG News', 300],
  ['volume', 'Volume', 300], ['notes', 'Notes', 300], ['reddit', 'Reddit', 300], ['battery', 'Battery', 300]
];
const wall = document.querySelector('#widget-wall');
wall.innerHTML = '';
for (const [id, name, height] of widgets) {
  const figure = document.createElement('figure');
  const width = id === 'news' ? 420 : id === 'battery' ? 300 : 360;
  for (const mode of ['dark', 'light']) {
    const img = document.createElement('img');
    img.className = 'only-' + mode;
    img.src = `screenshots/widgets/${mode}-${id}.png`;
    img.width = width; img.height = height; img.loading = 'lazy';
    img.alt = `The ${name} widget in ${mode} mode.`;
    figure.append(img);
  }
  const caption = document.createElement('figcaption');
  caption.textContent = name;
  figure.append(caption);
  wall.append(figure);
}

/* Fullscreen demo */
const demo = document.querySelector('#fullscreen-demo');
const play = document.querySelector('#demo-play');
const contain = document.querySelector('#demo-contain');
const status = document.querySelector('#demo-status');
function paintDemo() {
  const full = demo.dataset.fullscreen === 'true', contained = contain.checked;
  demo.dataset.contained = String(contained);
  play.setAttribute('aria-pressed', String(full));
  play.querySelector('.ms').textContent = full ? 'fullscreen_exit' : 'fullscreen';
  play.querySelector('.label').textContent = full ? 'Exit fullscreen' : 'Play fullscreen';
  demo.querySelector('.video-fs').textContent = full ? 'fullscreen_exit' : 'fullscreen';
  status.textContent = !full
    ? (contained ? 'Press play to go fullscreen. The video stays inside its tile.' : 'Press play to see ordinary fullscreen, which takes over the whole monitor.')
    : (contained ? 'Fullscreen, inside the tile. The clock and your chat are still right there.' : 'Ordinary fullscreen: the video covers every tile on the monitor.');
}
play.addEventListener('click', () => { demo.dataset.fullscreen = String(demo.dataset.fullscreen !== 'true'); paintDemo(); });
contain.addEventListener('change', paintDemo);
// ?demo=full or ?demo=free opens the demo in fullscreen, inside the tile or across the monitor.
const start = new URLSearchParams(location.search).get('demo');
if (start === 'full' || start === 'free') { demo.dataset.fullscreen = 'true'; contain.checked = start === 'full'; }
paintDemo();

/* Accent preview */
const swatches = [...document.querySelectorAll('[data-accent]')];
const accentImage = document.querySelector('#accent-image');
function pickAccent(button) {
  const name = button.dataset.accent;
  accentImage.src = name === 'iris' ? 'screenshots/dark-studio.png' : `screenshots/accent-${name}.png`;
  accentImage.alt = `Setpiece Studio with the ${button.getAttribute('aria-label')} accent.`;
  swatches.forEach(s => {
    const on = s === button;
    s.setAttribute('aria-checked', String(on)); s.tabIndex = on ? 0 : -1;
    s.innerHTML = on ? '<span class="ms" aria-hidden="true">check</span>' : '';
  });
}
swatches.forEach((s, i) => {
  s.addEventListener('click', () => pickAccent(s));
  s.addEventListener('keydown', e => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) { e.preventDefault(); const next = swatches[(i + step + swatches.length) % swatches.length]; pickAccent(next); next.focus(); }
  });
});

/* Screenshots that switch file with the theme rather than via CSS. */
function refreshThemed() {
  const url = `screenshots/${theme()}-${tourImage.dataset.name}.png`;
  if (!tourImage.src.endsWith(url)) { tourImage.src = url; document.querySelector('#tour-link').href = url; }
}
refreshThemed();

/* Copy build commands */
document.querySelector('#copy-build').addEventListener('click', async () => {
  const out = document.querySelector('#copy-status');
  try { await navigator.clipboard.writeText(document.querySelector('#build-commands').textContent); out.textContent = 'Build commands copied.'; }
  catch { out.textContent = 'Select the commands above and copy them manually.'; }
});

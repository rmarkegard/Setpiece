'use strict';
const screens = {
  studio: { file: 'terminal-studio.png', height: 1250, description: 'Studio — edit layouts and assign content to each tile.', alt: 'Setpiece Studio showing three displays, a layout canvas with an unassigned application, Clock and Weather tiles, and tile settings.' },
  widgets: { file: 'terminal-widgets.png', height: 2200, description: 'Widgets — browse daily tools, device widgets, and optional integrations.', alt: 'Setpiece widget library in dark mode, with daily, device, connected, preview, and retired categories.' },
  browsers: { file: 'terminal-browsers.png', height: 1250, description: 'Browsers — create and manage named browser sessions.', alt: 'Setpiece Browsers screen with named browser creation and an empty browser collection.' },
  appearance: { file: 'terminal-appearance.png', height: 2100, description: 'Appearance — choose themes, accent colors, and profile wallpapers.', alt: 'Setpiece Appearance screen in dark mode with light and dark previews, accent colors, and wallpapers.' }
};
const tabs = [...document.querySelectorAll('[data-screen]')];
function selectScreen(tab) {
  const screen = screens[tab.dataset.screen];
  const image = document.querySelector('#app-screen');
  const url = 'reveal/screenshots/' + screen.file;
  image.src = url;
  image.alt = screen.alt;
  image.height = screen.height;
  document.querySelector('#screen-link').href = url;
  document.querySelector('#screen-link').setAttribute('aria-label', 'Open full-size ' + tab.textContent.trim() + ' screenshot');
  document.querySelector('#full-screen-link').href = url;
  document.querySelector('#screen-description').textContent = screen.description;
  document.querySelector('#screen-panel').setAttribute('aria-labelledby', tab.id);
  tabs.forEach(item => { item.setAttribute('aria-selected', String(item === tab)); item.tabIndex = item === tab ? 0 : -1; });
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectScreen(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectScreen(tabs[next]); tabs[next].focus(); }
  });
});
document.querySelector('#copy-build').addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(document.querySelector('#build-commands').textContent);
    status.textContent = 'Build commands copied.';
  } catch {
    status.textContent = 'Select the commands above and copy them manually.';
  }
});

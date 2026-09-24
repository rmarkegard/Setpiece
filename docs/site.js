'use strict';
const desktop = document.querySelector('.desktop');
const descriptions = { focus: 'A little focus. A few essentials.', balanced: 'A different balance. The same essentials.', wide: 'Spread out. Give each part some room.' };
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  desktop.dataset.layout = button.dataset.preset;
  document.querySelectorAll('[data-preset]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  document.querySelector('#layout-description').textContent = descriptions[button.dataset.preset];
}));
const screens = {
  studio: ['luna-studio.png', 'Setpiece Studio with display selection, a three-tile canvas, and tile settings.', 'Studio — shape a workspace, tile by tile.', 1250],
  widgets: ['terminal-widgets.png', 'Setpiece widget library in dark mode with daily, device, connected, and preview categories.', 'Widgets — find the essentials for your day.', 2200],
  appearance: ['luna-appearance.png', 'Setpiece Appearance settings with modes, accent colors, and wallpaper choices.', 'Appearance — choose your color, light, and wallpaper.', 2100],
  browsers: ['luna-browsers.png', 'Setpiece Browsers screen with named browser creation and an empty shared-browser collection.', 'Browsers — give each session a name and a home.', 1250]
};
document.querySelectorAll('[data-screen]').forEach(button => button.addEventListener('click', () => {
  const [file, alt, caption, height] = screens[button.dataset.screen];
  const image = document.querySelector('#app-screen');
  image.src = 'reveal/screenshots/' + file;
  image.alt = alt;
  image.height = height;
  document.querySelector('#screen-link').href = image.src;
  document.querySelector('#screen-caption').textContent = caption;
  document.querySelectorAll('[data-screen]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));

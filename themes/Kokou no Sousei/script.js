/* Kokou no Sousei: TitleBar branding and clean lifecycle */
(() => {
  'use strict';
  window.__kokouNoSousei?.dispose();

  const THEME_NAME = 'Kokou no Sousei';
  const THEME_DISPLAY_NAME = 'KOKOU NO SOUSEI';

  let disposed = false, frame = 0, titlebarCenterEl = null;

  function updateTitleBar() {
    const titleBar = document.querySelector('.TitleBar_root, [class*="TitleBar_root"]');
    if (!titleBar) return;
    const nextText = titleBar.querySelector('.TitleBar_nextText, [class*="TitleBar_nextText"]');
    if (nextText) {
      nextText.style.setProperty('display', 'none', 'important');
    }
    if (!titlebarCenterEl || !titlebarCenterEl.isConnected) {
      const existing = titleBar.querySelector('.kns-titlebar-center');
      if (existing) {
        titlebarCenterEl = existing;
      } else {
        titlebarCenterEl = document.createElement('div');
        titlebarCenterEl.className = 'kns-titlebar-center';
        titlebarCenterEl.innerHTML = `
          <img class="kns-titlebar-logo" src="http://127.0.0.1:2007/assets/logo.png?name=${encodeURIComponent(THEME_NAME)}" alt="" />
          <span class="kns-titlebar-text">${THEME_DISPLAY_NAME}</span>
        `;
        titleBar.appendChild(titlebarCenterEl);
      }
    }
  }

  function handleMutations() {
    frame = 0;
    if (disposed) return;
    updateTitleBar();
  }

  const mo = new MutationObserver(() => {
    if (!frame && !disposed) frame = requestAnimationFrame(handleMutations);
  });

  function dispose() {
    disposed = true;
    mo.disconnect();
    headObserver.disconnect();
    cancelAnimationFrame(frame);
    titlebarCenterEl?.remove();
    titlebarCenterEl = null;
    delete window.__kokouNoSousei;
  }

  // Next Music removes the injected <style> when the addon is switched off.
  const style = [...document.querySelectorAll('style[data-nmc-addon-css]')].find(s => s.textContent.includes('KOKOU_NO_SOUSEI_THEME'));
  const headObserver = new MutationObserver(() => { if (style && !style.isConnected) dispose(); });
  if (style) headObserver.observe(document.head, { childList: true, subtree: true });
  window.__kokouNoSousei = { dispose };

  function init() {
    if (disposed) return;
    updateTitleBar();
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init, { once: true });
})();

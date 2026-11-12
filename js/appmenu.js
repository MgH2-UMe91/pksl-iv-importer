// 帯の右端の ⋮ メニュー(見た目の切り替えと、このアプリについて)
// app.js の最後で AppMenu.init() を呼ぶ
'use strict';

const AppMenu = (() => {
  const g = (id) => document.getElementById(id);

  function renderTheme() {
    const now = Theme.load();
    for (const mode of Theme.MODES) {
      const b = g(`theme-${mode}`);
      b.setAttribute('aria-checked', String(mode === now));
      b.textContent = `${mode === now ? '✓ ' : '　'}${Theme.LABELS[mode]}`;
    }
  }

  function close() {
    g('app-menu').hidden = true;
    g('app-menu-btn').setAttribute('aria-expanded', 'false');
  }

  // 版は、保存している Service Worker のキャッシュ名(iv-importer-30 など)から読む。オフラインでも出せる
  async function version() {
    try {
      const names = (await caches.keys()).filter((n) => /^iv-importer-\d+$/.test(n)).map((n) => Number(n.split('-').pop()));
      if (names.length) return String(Math.max(...names));
    } catch (e) { /* 次へ */ }
    try {
      const m = /VERSION = '(\d+)'/.exec(await (await fetch('sw.js', { cache: 'no-cache' })).text());
      if (m) return m[1];
    } catch (e) { /* 次へ */ }
    return '不明';
  }

  async function openAbout() {
    close();
    g('about-version').textContent = '…';
    document.documentElement.classList.add('modal-open');
    const d = g('about-dialog');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    g('about-title').focus({ preventScroll: true });
    g('about-version').textContent = await version();
  }

  function closeAbout() {
    const d = g('about-dialog');
    if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
    document.documentElement.classList.remove('modal-open');
  }

  function init() {
    renderTheme();
    g('app-menu-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      const open = g('app-menu').hidden;
      g('app-menu').hidden = !open;
      g('app-menu-btn').setAttribute('aria-expanded', String(open));
    });
    for (const mode of Theme.MODES) {
      g(`theme-${mode}`).addEventListener('click', () => { Theme.set(mode); renderTheme(); });
    }
    // ホーム画面のアプリで開いているときは出さない。「もう表示しない」を押した人も、ここからは使える
    g('install-open').hidden = Install.standalone();
    g('install-open').addEventListener('click', () => {
      close();
      if (!Install.addNow()) Install.guide(); // 追加の画面を取ってあればそのまま出し、なければ手順の案内
    });
    g('about-open').addEventListener('click', openAbout);
    g('about-close').addEventListener('click', closeAbout);
    g('about-dialog').addEventListener('click', (ev) => { if (ev.target === g('about-dialog')) closeAbout(); });
    g('about-dialog').addEventListener('close', () => document.documentElement.classList.remove('modal-open'));
    g('about-dialog').addEventListener('cancel', () => document.documentElement.classList.remove('modal-open'));
    document.addEventListener('click', (ev) => { if (!ev.target.closest('#app-menu, #app-menu-btn')) close(); });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
  }

  return { init, version };
})();

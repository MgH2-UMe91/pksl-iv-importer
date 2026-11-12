// 見た目(自動・ライト・ダーク)。選んだものは localStorage に覚え、html の data-theme に付ける
// 自動のときは data-theme を付けず、端末の設定(prefers-color-scheme)に合わせる
// 読み込み直後にちらつかないよう、同じ処理を index.html の head の先頭でも行っている(ここの KEY と同じ名前)
'use strict';

const Theme = (() => {
  const KEY = 'iv-importer-theme';
  const MODES = ['auto', 'light', 'dark'];
  const LABELS = { auto: '自動', light: 'ライト', dark: 'ダーク' };

  const load = () => { try { const t = localStorage.getItem(KEY); return MODES.includes(t) ? t : 'auto'; } catch (e) { return 'auto'; } };
  const save = (mode) => { try { if (mode === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, mode); } catch (e) { /* 覚えられなくても動く */ } };
  // 画面に反映する。auto は data-theme を外す
  const apply = (mode, root = document.documentElement) => {
    if (mode === 'light' || mode === 'dark') root.dataset.theme = mode; else delete root.dataset.theme;
  };
  const set = (mode) => { const m = MODES.includes(mode) ? mode : 'auto'; save(m); apply(m); return m; };

  return { KEY, MODES, LABELS, load, save, apply, set };
})();

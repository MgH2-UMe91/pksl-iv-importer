// 食材の選択欄に出すアイコン。ゲームの画像は使わず、色だけ寄せて図形で描いたもの
'use strict';

const INGREDIENT_ICONS = (() => {
  const svg = (body) => `<svg viewBox="0 0 24 24" aria-hidden="true" stroke="#00000030" stroke-width=".6">${body}</svg>`;
  const stem = '#4f9a3f';
  return {
    'おいしいシッポ': svg('<circle cx="12" cy="12" r="9" fill="#f5b9c4"/><path d="M12 12c1-2 4-1 4 1s-3 4-6 3-4-5-2-8 7-3 9 0" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'),
    'ずっしりカボチャ': svg(`<ellipse cx="12" cy="14" rx="10" ry="8" fill="#f08a1d"/><path d="M8 7c-2 4-2 10 0 14M16 7c2 4 2 10 0 14" fill="none" stroke="#c96a10" stroke-width="1"/><rect x="10.5" y="3" width="3" height="4" rx="1" fill="${stem}"/>`),
    'ふといながねぎ': svg(`<path d="M4 21 15 10l3 3L7 23z" fill="#f2f0d2"/><path d="M15 10c0-3 1-6 4-8 0 3 1 3 3 3-1 4-3 7-6 8z" fill="${stem}"/>`),
    'あじわいキノコ': svg('<path d="M9 13h6l1 8h-8z" fill="#ecc9a0"/><path d="M2 14C2 7 7 3 12 3s10 4 10 11c-6-2-14-2-20 0z" fill="#a8562a"/>'),
    'つやつやアボカド': svg('<path d="M12 2c3 0 4 4 6 8s2 12-6 12-8-8-6-12 3-8 6-8z" fill="#a9c94b"/><path d="M12 6c2 0 3 3 4 6s1 8-4 8-5-5-4-8 2-6 4-6z" fill="#d8e38a" stroke="none"/><circle cx="12" cy="15" r="3.4" fill="#b9793c"/>'),
    'めざましコーヒー': svg('<ellipse cx="8" cy="9" rx="5.5" ry="4.5" transform="rotate(-25 8 9)" fill="#8a5a3a"/><ellipse cx="16" cy="11" rx="5.5" ry="4.5" transform="rotate(20 16 11)" fill="#a0693f"/><ellipse cx="10" cy="17" rx="5.5" ry="4.5" transform="rotate(10 10 17)" fill="#7a4e30"/><path d="M4 11c3-1 5-3 7-5M12 14c3 0 6-1 8-5M5 18c3 0 7-1 10-2" fill="none" stroke="#e7cfae" stroke-width="1"/>'),
    'リラックスカカオ': svg('<path d="M3 13C5 6 11 3 21 4c1 9-3 16-11 17-4 0-7-3-7-8z" fill="#c9702a"/><path d="M7 16c3-3 7-7 11-9M6 11c1-2 3-4 6-5M11 19c3-1 6-3 7-7" fill="none" stroke="#99501a" stroke-width="1"/>'),
    'ワカクサコーン': svg(`<path d="M12 1c4 3 5 10 3 17h-6C7 11 8 4 12 1z" fill="#f5cc2e"/><path d="M9 10h6M8.7 14h6.6M9.5 6h5M12 2v15" fill="none" stroke="#d4a312" stroke-width=".8"/><path d="M12 23C7 21 5 15 6 9c2 3 4 6 6 9 2-3 4-6 6-9 1 6-1 12-6 14z" fill="${stem}"/>`),
    'げきからハーブ': svg('<g transform="rotate(-18 12 12)"><path d="M12 18v5.5" stroke="#d9b45a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 1l2.2 5 3-1.6-1 4.8 4.8-1.6-1.4 4.2 3.4 1.6-5 3.8 1 2.6-5.8-1.2h-2.4L5 19.8l1-2.6-5-3.8 3.4-1.6L3 7.6l4.8 1.6-1-4.8 3 1.6z" fill="#c8243c" stroke-linejoin="round"/><path d="M12 18V6M12 14l5-4M12 14l-5-4M12 16.5l4 .3M12 16.5l-4 .3" fill="none" stroke="#ec7a8c" stroke-width=".7"/></g>'),
    'ほっこりポテト': svg('<ellipse cx="12" cy="12.5" rx="10" ry="8" fill="#e8c77e"/><circle cx="8" cy="10" r=".8" fill="#b08c45"/><circle cx="15" cy="9" r=".8" fill="#b08c45"/><circle cx="13" cy="15" r=".8" fill="#b08c45"/>'),
    'ピュアなオイル': svg(`<path d="M9 8h6l3 4v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9z" fill="#f0dc5a"/><rect x="9.5" y="2" width="5" height="6" rx="1" fill="${stem}"/><rect x="7" y="14" width="10" height="5" fill="#fff8c8" stroke="none"/>`),
    'とくせんエッグ': svg('<path d="M12 2c5 0 8 7 8 12s-3 8-8 8-8-3-8-8 3-12 8-12z" fill="#fbf3e0"/>'),
    'あんみんトマト': svg(`<circle cx="12" cy="13.5" r="9.5" fill="#e5392e"/><path d="M12 4 8 2l1 3-4 1 4 1 3 3 3-3 4-1-4-1 1-3z" fill="${stem}"/>`),
    'あったかジンジャー': svg('<path d="M4 19c-2-4 2-7 5-7 0-3 1-8 5-9 3 0 4 3 2 5 3-1 6 1 5 4s-5 3-7 2c0 3-1 8-5 8-2 0-4-1-5-3z" fill="#e3a94a"/>'),
    'マメミート': svg('<rect x="1" y="7" width="22" height="10" rx="5" transform="rotate(-35 12 12)" fill="#e88a4a"/><path d="M8 12l3 3M11 9l3 3M14 7l3 3" fill="none" stroke="#fbd0a8" stroke-width="1.2"/>'),
    'あまいミツ': svg('<rect x="4" y="7" width="16" height="15" rx="4" fill="#f5b52a"/><rect x="5" y="2" width="14" height="5" rx="1.5" fill="#5fa8a0"/><rect x="7" y="10" width="3" height="8" rx="1.5" fill="#ffe08a" stroke="none"/>'),
    'ワカクサ大豆': svg('<ellipse cx="8" cy="10" rx="6" ry="4.5" fill="#e8d49a"/><ellipse cx="16" cy="9" rx="6" ry="4.5" fill="#f0dfae"/><ellipse cx="12" cy="16" rx="6" ry="4.5" fill="#dfc988"/>'),
    'モーモーミルク': svg('<path d="M9 7h6l2 4v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11z" fill="#fbf7f4"/><rect x="9" y="2" width="6" height="5" rx="1" fill="#5b9bd5"/><rect x="7" y="13" width="10" height="4" fill="#5b9bd5" stroke="none"/>'),
    'ひとくちナッツ': svg('<g transform="rotate(-40 12 12)"><path d="M12 1.5c4 0 6 3 6 6 0 2-1.200 3-1.200 4.500s1.200 2.500 1.200 4.500c0 3-2 6-6 6s-6-3-6-6c0-2 1.200-3 1.200-4.500S6 9.500 6 7.500c0-3 2-6 6-6z" fill="#dcb877"/><path d="M9 5v14M12 3.500v17M15 5v14M7.500 8h9M8 12h8M7.500 16h9" fill="none" stroke="#bd9450" stroke-width=".6"/></g>'),
    'とくせんリンゴ': svg(`<path d="M12 7c3-2 9-2 9 5 0 6-4 11-6 11-1 0-2-1-3-1s-2 1-3 1c-2 0-6-5-6-11 0-7 6-7 9-5z" fill="#d8242a"/><path d="M12 7c0-2 1-4 3-5M12 6c2-2 5-2 6 0-2 2-4 2-6 0z" fill="${stem}" stroke="${stem}"/>`),
  };
})();

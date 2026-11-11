// 「ホーム画面に追加」の案内(スマホのブラウザ版だけ。画面の下に出す)
// 出す条件: ホーム画面のアプリで開いていない / iPhone か Android / 開いた日が2日以上(同じ日に何回開いても1回)
//           / 「もう表示しない」を押していない / 「あとで」から14日たっている
// 読み取り中や、読み取った結果・手入力の行があるときは出さない(出ていても、操作を始めたら閉じる)
// 保存は端末の localStorage だけ。使えなければ数えられないので出さない
// BOX の保存はホーム画面のアプリの中だけ(ブラウザ版には保存しない)ので、ブラウザとアプリで保存が別になる注意は要らない
// guide() は BOX のボタンの横の「追加のしかた」から開く。回数や「あとで」に関係なく出し、閉じるボタンだけにする
const Install = (() => {
  const KEY = 'iv-importer-install';
  const LATER_MS = 14 * 86400000;
  let evt = null, active = false, setBtn = null, closer = () => {}, busy = () => false;

  // Android の Chrome は、追加できる状態になると beforeinstallprompt を送ってくる。取っておいて「追加する」で使う
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); evt = e; if (setBtn) setBtn(); });
  window.addEventListener('appinstalled', () => { save({ never: true }); close(); });

  const load = () => {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || '{}') || {};
      return { days: Array.isArray(o.days) ? o.days.filter((d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(-2) : [], laterAt: Number.isFinite(o.laterAt) ? o.laterAt : 0, never: o.never === true };
    } catch (e) { return { days: [], laterAt: 0, never: false }; }
  };
  function save(patch) { try { localStorage.setItem(KEY, JSON.stringify({ ...load(), ...patch })); } catch (e) { /* 保存できなければ出さない */ } }
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const os = () => {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
    return /Android/.test(ua) ? 'android' : '';
  };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function close() { active = false; setBtn = null; closer = () => {}; const el = document.getElementById('installPop'); if (el) el.remove(); }

  function eligible() {
    if (standalone() || !os()) return false;
    const t = today(), s0 = load();
    if (!s0.days.includes(t)) save({ days: [...s0.days, t].slice(-2) });
    const s = load();
    return !s.never && s.days.length >= 2 && Date.now() - s.laterAt >= LATER_MS;
  }

  function show(force = false) {
    if ((!force && (!active || busy())) || document.getElementById('installPop')) return;
    const kind = os();
    const pop = document.createElement('section');
    pop.id = 'installPop'; pop.className = 'install-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'ホーム画面に追加');
    const steps = kind === 'ios'
      ? '<ol><li>画面の下(または上)の共有ボタン <span class="ip-ic" aria-hidden="true">⎙</span>(□に↑)をタップ</li><li>メニューを少し上へ送り、「ホーム画面に追加」をタップ</li><li>右上の「追加」をタップ</li></ol><p class="ip-small">Safari で開いているときの手順です。他のブラウザなら、Safari で開き直してください。</p>'
      : '<div class="ip-android"></div>';
    pop.innerHTML = `<p class="ip-title">ホーム画面に追加できます</p>${steps}<div class="ip-btns">${force ? '<button type="button" id="ipClose">閉じる</button>' : '<button type="button" id="ipLater">あとで</button><button type="button" id="ipNever">もう表示しない</button>'}</div>`;
    document.body.append(pop);
    const later = () => { save({ laterAt: Date.now() }); close(); };
    if (force) pop.querySelector('#ipClose').onclick = () => { active = false; close(); };
    else {
      pop.querySelector('#ipLater').onclick = later;
      pop.querySelector('#ipNever').onclick = () => { save({ never: true }); close(); };
    }
    closer = close;
    if (kind === 'android') {
      const box = pop.querySelector('.ip-android');
      setBtn = () => {
        if (evt) {
          box.innerHTML = '<button type="button" class="primary" id="ipAdd">追加する</button>';
          box.querySelector('#ipAdd').onclick = async () => {
            const ev = evt; evt = null;
            try { ev.prompt(); const r = await ev.userChoice; if (r && r.outcome === 'accepted') { save({ never: true }); close(); } else later(); }
            catch (e) { later(); }
          };
        } else {
          box.innerHTML = '<ol><li>画面の右上の︙メニューをタップ</li><li>「ホーム画面に追加」または「アプリをインストール」をタップ</li></ol>';
        }
      };
      setBtn(); // イベントがまだ、または来ないブラウザでは手順の案内。あとからイベントが来たらボタンに替わる
    }
  }

  return {
    // isBusy: 読み取り中や、行があるときに true を返す関数
    init(isBusy) { busy = isBusy; active = eligible(); if (active) setTimeout(show, 1500); },
    // 操作を始めたら閉じる(次の訪問でまた出る)
    standalone,
    guide() { active = true; show(true); },
    dismiss() { if (document.getElementById('installPop')) close(); active = false; },
    _test: { eligible, load, KEY },
  };
})();

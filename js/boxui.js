// BOX の画面。保存ボタン(取込みタブの4)と、BOX タブ(箱の並び・箱のメニュー・個体の編集画面・CSV の読み込み)
// ホーム画面に追加したアプリ(standalone)でだけ使える。ブラウザで開いたときは、保存ボタンを灰色にして、BOX タブには案内だけを出す
// app.js の state・loadRows・esc・ingredientField・evolutionField・selectField などを使うので、app.js より前に読み込み、app.js の最後で BoxUi.init() を呼ぶ
'use strict';

const BoxUi = (() => {
  let boxes = [Box.load(1), Box.load(2)];
  let active = 1;        // BOX タブで見ている BOX
  let restoredFrom = 0;  // 3 へ戻した元の BOX(0 なら戻していない)
  let onlyFlag = false;  // 要確認の個体だけを表示しているか
  let selected = null;   // 箱をタップして、メニューを出している個体の番号
  let selectMode = false; // 複数選択のモードか
  let typesSel = new Set(); // タイプの絞り込み(タイプの英語名)
  let subsSel = new Set();  // サブスキルの絞り込み(名前)
  let ingSel = '';          // 食材の絞り込み(食材名。空なら絞らない)
  let nickOnly = false;     // ニックネームをつけた個体だけ
  let sortKey = 'level';    // 並べ替え
  let reverse = false;      // 並べ替えの向きを逆にしているか(↓ が通常、↑ が逆)
  let picked = new Set(); // 複数選択で選んでいる個体の番号
  let sheet = null;      // 開いている編集画面 { idx, row, order, timer }
  let savedSig = '';     // 最後に保存した(または戻した)ときの 3 の中身。違えば「保存していない行がある」
  const enabled = () => Install.standalone();
  const sig = () => JSON.stringify(state.rows.map(Box.pack));
  const unsaved = () => state.rows.length > 0 && sig() !== savedSig;
  const nameOf = (n) => Box.nameOf(boxes[n - 1], n);
  const g = (id) => document.getElementById(id);
  const okNow = () => !g('copy').disabled;

  // ---------- 上のタブ(取込み / BOX) ----------
  function setTab(name, remember = true) {
    const box = name === 'box';
    g('tab-import').setAttribute('aria-selected', String(!box));
    g('tab-box').setAttribute('aria-selected', String(box));
    g('pane-import').hidden = box;
    g('pane-box').hidden = !box;
    g('box-top').hidden = !(box && enabled()); // 上部の固定部分(BOX の切り替え・複数選択)は BOX タブのときだけ
    g('box-bar').hidden = !(box && enabled()); // 下の固定バーも同じ
    if (remember) Box.saveTab(name);
    if (!box) endSelect();
    if (box) renderAll();
    closeMenus();
  }

  // ---------- 取込みタブの4: BOX に保存 ----------
  function renderSave(ok) {
    const count = state.rows.length;
    if (!enabled()) {
      g('box-save-1').disabled = true;
      g('box-save-1').textContent = 'BOXに保存';
      g('box-save-2').hidden = true;
      g('box-browser').hidden = false;
      g('box-save-warn').textContent = g('box-save-result').textContent = '';
      return;
    }
    g('box-browser').hidden = true;
    g('box-save-2').hidden = false;
    const plan = Box.plan(count, boxes.map((b) => b.rows.length), restoredFrom);
    for (const n of [1, 2]) {
      const b = g(`box-save-${n}`);
      b.textContent = `${nameOf(n)} に${restoredFrom === n ? '上書き保存' : '保存'}(${boxes[n - 1].rows.length}/${Box.MAX})`;
      b.disabled = !ok || count === 0 || !plan[n - 1].fits;
    }
    // 入りきらないBOXがあるときは、理由を出す(ポップアップは使わない)
    let warn = '';
    const no = [1, 2].filter((n) => !plan[n - 1].fits);
    if (count > 0 && no.length === 2) {
      warn = `どちらのBOXにも入りません(1つのBOXは${Box.MAX}匹までです)。${count}匹を減らしてから保存してください。`;
    } else if (count > 0 && no.length === 1) {
      const n = no[0], other = 3 - n;
      warn = restoredFrom === n
        ? `${nameOf(n)}は${Box.MAX}匹までです。${count}匹は上書きできないので、${nameOf(other)}へ保存してください。`
        : `${nameOf(n)}にはあと${plan[n - 1].room}匹しか入りません。${count}匹は入らないので、${nameOf(other)}へ保存してください。`;
    }
    g('box-save-warn').textContent = warn;
    if (sig() !== savedSig) g('box-save-result').textContent = '';
  }

  function save(n) {
    const count = state.rows.length;
    const packed = state.rows.map(Box.pack);
    const overwrite = restoredFrom === n;
    const rows = overwrite ? packed : boxes[n - 1].rows.concat(packed);
    if (rows.length > Box.MAX) return; // ボタンは灰色のはずだが、念のため
    if (!Box.save(n, { name: boxes[n - 1].name, rows })) {
      g('box-save-result').textContent = '保存できませんでした。端末の空き容量や、ブラウザの設定を確かめてください。';
      return;
    }
    boxes[n - 1] = Box.load(n);
    savedSig = sig();
    g('box-save-result').textContent = overwrite ? `${nameOf(n)}に${count}匹を上書き保存しました。` : `${nameOf(n)}に${count}匹追加しました。`;
    renderAll();
    renderSave(true);
  }

  // ---------- BOX タブ: 箱の並び ----------
  function renderTabs() {
    g('box-tabs').innerHTML = [1, 2].map((n) => `<button type="button" role="tab" aria-selected="${n === active}" data-tab="${n}" class="${n === active ? 'selected' : ''}">${esc(nameOf(n))} <small>${boxes[n - 1].rows.length}/${Box.MAX}</small></button>`).join('');
  }

  // 全匹をスクロールで見せる(ページ分けはしない)
  const SORTS = [['level', 'レベル'], ['species', '名前'], ['dex', '図鑑番号'], ['type', 'タイプ'], ['added', '追加順']];
  const viewOpts = () => ({ query: g('box-filter').value, ingredient: ingSel, types: [...typesSel], subs: [...subsSel], nicknamed: nickOnly, onlyFlag, sort: sortKey, reverse, page: 0, pageSize: 1e9 });
  // 絞り込みがかかっているか(並べ替えは含めない)
  const isFiltering = () => !!(g('box-filter').value.trim() || ingSel || typesSel.size || subsSel.size || nickOnly || onlyFlag);
  const label = (a) => `${a[1] || '(種族なし)'}${a[0] ? `(${a[0]})` : ''}`;

  // 色の四角アイコン(data/pokeicons.js)。色違いは色違い用の色。データにない種族は灰色の四角
  function iconSvg(name, shiny, size = 32) {
    const d = POKE_ICONS[name];
    if (!d) return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><rect width="${size}" height="${size}" fill="#bbbbbb"/></svg>`;
    const pal = shiny ? d[1] : d[0];
    const f = (v) => (v * size).toFixed(1);
    const rects = d[2].map(([x, y, w, h, r, c]) => `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${r ? ` rx="${f(r)}"` : ''} fill="${pal[c]}"/>`).join('');
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${rects}</svg>`;
  }

  function cellHtml({ a, i, flag }) {
    const isSel = !selectMode && selected === i;
    const cls = `cell${flag ? ' flag' : ''}${isSel ? ' sel' : ''}${selectMode && picked.has(i) ? ' chk' : ''}`;
    // 上から: Lv / 色の四角アイコン / ニックネーム(なければ種族名)
    return `<button type="button" class="${cls}" data-i="${i}" aria-label="${esc(label(a))}、Lv${a[2] ?? '?'}${a[7] === 1 ? '、色違い' : ''}"><span class="c-hd"><i>Lv.</i>${a[2] ?? '?'}</span><span class="c-ic">${iconSvg(a[1], a[7] === 1)}</span><span class="c-nm">${esc(a[0] || a[1] || '(未設定)')}</span><span class="c-k" aria-hidden="true">⋮</span></button>`;
  }

  function renderGrid() {
    const data = boxes[active - 1];
    const v = Box.view(data.rows, viewOpts());
    if (onlyFlag && !v.flagged) onlyFlag = false; // 要確認がなくなったら、絞り込みを外す
    picked = new Set([...picked].filter((i) => i < data.rows.length));
    g('box-grid').innerHTML = v.items.map(cellHtml).join('');
    const total = data.rows.length;
    const flagged = v.flagged; // 辞書にない値などで、出力できない個体
    const fb = g('box-flag');
    fb.hidden = !flagged;
    fb.textContent = onlyFlag
      ? `オレンジ枠の${flagged}匹だけを表示中です。押すと、すべての個体の表示に戻ります。`
      : `確認が必要な個体が${flagged}匹あります。押すと、その個体だけを表示します。直すまで、CSVのコピー・保存(ファイル)はできません。`;
    const filtering = isFiltering();
    g('box-count').textContent = (total === 0 ? 'このBOXは空です。' : filtering ? `${v.total}匹中${v.count}匹を表示` : `${total}匹`)
      + (data.broken ? '(一部を読めませんでした)' : '');
    for (const id of ['box-restore', 'box-clear']) g(id).disabled = total === 0;
    for (const id of ['box-copy', 'box-file']) g(id).disabled = total === 0 || flagged > 0; // 3の4と同じく、直す項目が残っている間は出さない
    g('sel-start').disabled = total === 0;
    g('sort-open').textContent = SORTS.find((x) => x[0] === sortKey)[1];
    g('sort-dir').textContent = reverse ? '↑' : '↓';
    const fb2 = g('filter-open');
    fb2.textContent = filtering ? '🔍 ON' : '🔍 OFF';
    fb2.classList.toggle('on', filtering);
    g('filter-count').textContent = filtering ? `${v.total}匹中${v.count}匹を表示します。` : `${total}匹すべてを表示します。`;
    updateSelUi();
    placeCellMenu();
  }

  // 絞り込み・並べ替えを変えたら、選んでいる箱のメニューを閉じる
  const firstPage = () => { selected = null; renderGrid(); };

  function renderAll() {
    const on = enabled();
    g('box-app').hidden = !on;
    g('box-browser-note2').hidden = on;
    g('box-top').hidden = !(on && !g('pane-box').hidden);
    g('box-bar').hidden = !(on && !g('pane-box').hidden);
    if (!on) return;
    renderTabs();
    renderGrid();
  }

  // ---------- 箱のメニュー(編集・削除)と、そのほかのメニュー(⋯) ----------
  function placeCellMenu() {
    const menu = g('box-cell-menu');
    const cell = selected === null ? null : g('box-grid').querySelector(`.cell[data-i="${selected}"]`);
    if (!cell) { menu.hidden = true; return; }
    menu.hidden = false;
    const wrap = g('box-grid-wrap');
    const left = Math.max(0, Math.min(cell.offsetLeft, wrap.clientWidth - menu.offsetWidth));
    menu.style.left = `${left}px`;
    menu.style.top = `${cell.offsetTop + cell.offsetHeight - 4}px`;
    g('cell-move-label').textContent = `${nameOf(3 - active)}へ移動`;
  }

  function closeMenus() {
    if (selected !== null) { selected = null; for (const c of g('box-grid').querySelectorAll('.cell.sel')) c.classList.remove('sel'); }
    g('box-cell-menu').hidden = true;
    for (const id of ['box-more', 'csv-menu', 'sort-menu']) g(id).hidden = true;
    for (const id of ['box-more-btn', 'csv-open', 'sort-open']) g(id).setAttribute('aria-expanded', 'false');
  }

  function selectCell(i) {
    closeMenus();
    selected = i;
    const cell = g('box-grid').querySelector(`.cell[data-i="${i}"]`);
    if (cell) cell.classList.add('sel');
    placeCellMenu();
  }

  function deleteCell() {
    const i = selected;
    if (i === null) return;
    const a = boxes[active - 1].rows[i];
    closeMenus();
    ask(`「${esc(label(a))}」を消しますか？<b class="box-danger">この操作は取り消せません。</b>`, [
      { label: '消す', cls: 'danger', fn: () => {
        const data = boxes[active - 1];
        Box.save(active, { name: data.name, rows: Box.removeAt(data.rows, i) });
        boxes[active - 1] = Box.load(active);
        renderAll();
        renderSave(okNow());
      } },
      { label: 'やめる' },
    ]);
  }

  // 画面の下に一言だけ出す(2秒で消える)
  let toastTimer = 0;
  function toast(text) {
    const t = g('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
  }

  // メニューの「BOXへ移動」: もう一方の BOX へ1匹移す。入らなければ移さず、理由を出す
  function moveCell() {
    const i = selected, from = active, to = 3 - active;
    if (i === null) return;
    closeMenus();
    const plan = Box.canMove(1, boxes[to - 1].rows.length);
    if (!plan.fits) { ask(`${esc(nameOf(to))}は${Box.MAX}匹までで、いっぱいです。1匹も移せません。`, [{ label: '閉じる' }]); return; }
    const dst = boxes[to - 1], src = boxes[from - 1];
    if (!Box.save(to, { name: dst.name, rows: dst.rows.concat(Box.pick(src.rows, [i])) })) { toast('保存できませんでした。端末の空き容量を確かめてください。'); return; }
    if (!Box.save(from, { name: src.name, rows: Box.removeAt(src.rows, i) })) {
      Box.save(to, { name: dst.name, rows: dst.rows }); // 元に戻す(二重にならないように)
      toast('保存できませんでした。端末の空き容量を確かめてください。');
      return;
    }
    boxes[to - 1] = Box.load(to);
    boxes[from - 1] = Box.load(from);
    renderAll();
    renderSave(okNow());
    toast(`1匹を${nameOf(to)}へ移しました。`);
  }

  // メニューの「複製」: 同じ個体を、このBOXの最後に1匹足す
  function duplicateCell() {
    const i = selected;
    if (i === null) return;
    closeMenus();
    const data = boxes[active - 1];
    if (!Box.canMove(1, data.rows.length).fits) { ask(`${esc(nameOf(active))}は${Box.MAX}匹までで、いっぱいです。複製できません。`, [{ label: '閉じる' }]); return; }
    if (!Box.save(active, { name: data.name, rows: Box.duplicate(data.rows, i) })) { toast('保存できませんでした。端末の空き容量を確かめてください。'); return; }
    boxes[active - 1] = Box.load(active);
    renderAll();
    renderSave(okNow());
    toast('複製しました(いちばん最後に追加しています)。');
  }

  // ---------- 個体の編集画面(全画面のシート) ----------
  const NATURE_UP = '▲', NATURE_DOWN = '▼';
  const fxHtml = (nature) => {
    const fx = Box.natureEffect(nature);
    return fx ? `<span class="fx-up">${NATURE_UP} ${esc(fx.up)}</span><span class="fx-down">${NATURE_DOWN} ${esc(fx.down)}</span>` : '<span class="fx-none">補正なし</span>';
  };

  // app.js の renderRow が、編集画面の行を描き直すときにも使う。3の行の編集部品(食材・進化・選択欄)をそのまま使う
  function sheetHtml(row) {
    const own = Match.ingredientsOf(row.species) ?? INGREDIENTS;
    const lv = Number.isFinite(row.level) ? row.level : '';
    const skills = ['', 1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}"${n === row.skillLevel ? ' selected' : ''}>${n === '' ? '(なし)' : `Lv.${n}`}</option>`).join('');
    return `
    <div class="sheet-top">
      <label class="field sheet-nick" data-key="nickname"><input type="text" data-edit="nickname" value="${esc(row.nickname)}" placeholder="ニックネーム" autocomplete="off" aria-label="ニックネーム"></label>
    </div>
    <div class="sheet-block">
      <div class="field" data-key="species"><span>ポケモン</span>
        <input type="text" data-species value="${esc(row.species)}" placeholder="名前で検索" autocomplete="off">
      </div>
      ${evolutionField(row)}
    </div>
    <div class="sheet-block">
      <label class="field" data-key="level"><span>レベル</span><input type="number" data-edit="level" min="1" max="100" value="${lv}" inputmode="numeric"></label>
      <div class="lv-slider"><button type="button" data-lv-step="-1" aria-label="レベルを1下げる">◀</button><input type="range" data-edit="level" min="1" max="100" value="${lv === '' ? 1 : lv}" aria-label="レベルのスライダー"><button type="button" data-lv-step="1" aria-label="レベルを1上げる">▶</button></div>
    </div>
    <div class="sheet-block">${ingredientField(row, own)}</div>
    <h3 class="band">メインスキル・サブスキル</h3>
    <div class="sheet-block">
      <label class="field" data-key="skillLevel"><span>メインスキルのレベル</span><select data-edit="skillLevel">${skills}</select></label>
      <div class="sub-grid">${row.sub.map((s, i) => selectField(`Lv${[10, 25, 50, 75, 100][i]}`, `sub${i}`, s, SUBSKILLS)).join('')}</div>
    </div>
    <h3 class="band">詳細ステータス</h3>
    <div class="sheet-block">
      <div class="nature-row">${selectField('性格', 'nature', row.nature, NATURES)}<div class="fx" aria-label="性格の補正">${fxHtml(row.nature)}</div></div>
      <label class="field" data-key="ribbon"><span>一緒に眠った時間</span><select data-edit="ribbon">${RIBBONS.map((h) => `<option value="${h}"${h === row.ribbon ? ' selected' : ''}>${RIBBON_LABELS[h]}</option>`).join('')}</select></label>
      <div class="checks"><label class="check"><input type="checkbox" data-edit="shiny"${row.shiny ? ' checked' : ''}>色違い</label><label class="check"><input type="checkbox" data-edit="mint"${row.mint ? ' checked' : ''}>ミント使用</label></div>
    </div>
    <p class="seed-note" hidden></p>
    <ul class="messages"></ul>`;
  }

  const sheetEl = () => g('box-sheet-row');

  // BOX の番号 idx の個体を、編集画面の行にする
  function loadSheetRow(idx) {
    if (sheet && sheet.row) extraRows.delete(sheet.row.id);
    const p = Box.unpack(boxes[active - 1].rows[idx]);
    const row = Object.assign(newRow(), p, { manualLevel: Number.isFinite(p.level) ? p.level : null, readSkill: p.skillLevel });
    row.low = new Set(Box.lowKeys(row)); // 辞書にない値などの項目をオレンジ枠にする
    extraRows.set(row.id, row);
    sheet.idx = idx;
    sheet.row = row;
    sheetEl().dataset.id = row.id;
    sheetEl().innerHTML = sheetHtml(row);
    refreshRow(row, sheetEl());
    updateSheetNav();
    g('box-sheet').querySelector('.sheet-scroll').scrollTop = 0;
  }

  function updateSheetNav() {
    g('sheet-prev').disabled = Box.neighbor(sheet.order, sheet.idx, -1) === null;
    g('sheet-next').disabled = Box.neighbor(sheet.order, sheet.idx, 1) === null;
  }

  function openSheet(idx) {
    closeMenus();
    const order = Box.view(boxes[active - 1].rows, { ...viewOpts(), page: 0 }).order; // 今の並び・絞り込みで前後へ移れるように
    sheet = { idx, row: null, order, timer: 0 };
    loadSheetRow(idx);
    document.documentElement.classList.add('modal-open');
    const d = g('box-sheet');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    g('sheet-close').focus({ preventScroll: true }); // 入力欄にフォーカスを当てない(キーボードを出さない)
  }

  // 変更はその場で BOX に保存する(保存ボタンはない)。確認が必要な項目が残っていても保存し、箱をオレンジ枠にする
  function persist() {
    if (!sheet) return;
    clearTimeout(sheet.timer);
    sheet.timer = 0;
    const data = boxes[active - 1];
    const rows = Box.replaceAt(data.rows, sheet.idx, Box.pack(sheet.row));
    if (Box.save(active, { name: data.name, rows })) boxes[active - 1] = Box.load(active);
  }

  function afterEdit(row) {
    if (!sheet || sheet.row !== row) return;
    const root = sheetEl();
    const num = root.querySelector('input[type="number"][data-edit="level"]');
    const rng = root.querySelector('input[type="range"][data-edit="level"]');
    const lv = Number.isFinite(row.level) ? String(row.level) : '';
    if (num && document.activeElement !== num) num.value = lv;
    if (rng && document.activeElement !== rng) rng.value = lv === '' ? '1' : lv;
    const fx = root.querySelector('.fx');
    if (fx) fx.innerHTML = fxHtml(row.nature);
    clearTimeout(sheet.timer);
    sheet.timer = setTimeout(persist, 250);
  }

  function stepLevel(delta) {
    const row = sheet.row;
    const now = Number.isFinite(row.level) ? row.level : 0;
    row.level = Math.min(100, Math.max(1, now + delta));
    row.manualLevel = row.level;
    row.low.delete('level');
    sheetEl().querySelector('input[type="number"][data-edit="level"]').value = String(row.level);
    sheetEl().querySelector('input[type="range"][data-edit="level"]').value = String(row.level);
    touch(row);
  }

  function moveSheet(delta) {
    const next = Box.neighbor(sheet.order, sheet.idx, delta);
    if (next === null) return;
    persist();
    loadSheetRow(next);
  }

  // 編集画面を閉じる(✕・Esc のどちらでも通る)。保存してから、その個体のページの並びに戻る
  function finishSheet() {
    if (!sheet) return;
    persist();
    extraRows.delete(sheet.row.id);
    const idx = sheet.idx;
    sheet = null;
    document.documentElement.classList.remove('modal-open');
    renderAll();
    renderSave(okNow());
    const cell = g('box-grid').querySelector(`.cell[data-i="${idx}"]`);
    if (cell) cell.scrollIntoView({ block: 'center' }); // 直した個体の箱が見える位置へ
  }

  function closeSheet() {
    const d = g('box-sheet');
    if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
    finishSheet();
  }

  // ---------- 確認など(画面の中央のダイアログ) ----------
  // buttons: [{ label, cls, fn }]。押すと先に閉じてから fn を呼ぶ
  function ask(html, buttons, focusId = '') {
    g('ask-msg').innerHTML = html;
    const box = g('ask-actions');
    box.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      if (b.cls) btn.className = b.cls;
      btn.addEventListener('click', () => { closeAsk(); if (b.fn) b.fn(); });
      box.append(btn);
    }
    document.documentElement.classList.add('modal-open');
    const d = g('ask-dialog');
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    (focusId ? g(focusId) : g('ask-msg')).focus({ preventScroll: true }); // 入力が要るとき以外は、キーボードを出さない
  }
  function closeAsk() {
    const d = g('ask-dialog');
    if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
    document.documentElement.classList.remove('modal-open');
  }

  function rename() {
    ask(`<label class="field"><span>BOXの名前(全角${Box.NAME_MAX}文字まで。空にすると「${esc(Box.defaultName(active))}」に戻ります)</span><input id="box-name" type="text" maxlength="${Box.NAME_MAX}" value="${esc(boxes[active - 1].name)}" placeholder="${esc(Box.defaultName(active))}" autocomplete="off"></label>`, [
      { label: '決定', cls: 'primary', fn: () => {
        const data = boxes[active - 1];
        data.name = Box.cleanName(g('box-name').value);
        Box.save(active, data);
        boxes[active - 1] = Box.load(active);
        renderAll();
        renderSave(okNow());
      } },
      { label: 'やめる' },
    ], 'box-name');
  }

  function restore() {
    const n = active;
    const go = () => {
      loadRows(boxes[n - 1].rows.map(Box.unpack));
      restoredFrom = n;
      savedSig = sig();
      renderSave(okNow());
      setTab('import');
      g('list-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (!unsaved()) { go(); return; }
    ask('3の一覧に、BOXに保存していない行があります。戻すと、その行は消えます。', [
      { label: '先にBOXへ保存する', cls: 'primary', fn: () => { setTab('import'); g('box-save').scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
      { label: '消して戻す', fn: go },
      { label: 'やめる' },
    ]);
  }

  async function writeClipboard(text) {
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
  }

  async function copy() {
    await writeClipboard(Box.csv(boxes[active - 1].rows));
    toast('CSVをコピーしました。');
  }

  function file() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Box.csv(boxes[active - 1].rows)], { type: 'text/csv' }));
    a.download = Box.fileName(nameOf(active));
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function clear() {
    const n = active;
    ask(`「${esc(nameOf(n))}」の${boxes[n - 1].rows.length}匹をすべて消します。<b class="box-danger">この操作は取り消せません。</b>`, [
      { label: '空にする', cls: 'danger', fn: () => {
        Box.save(n, { name: boxes[n - 1].name, rows: [] });
        boxes[n - 1] = Box.load(n);
        renderAll();
        renderSave(okNow());
      } },
      { label: 'やめる' },
    ]);
  }

  // ---------- 複数選択(選んだ個体を、CSVコピー・BOX移動・一括編集・削除) ----------
  const pickedRows = () => Box.pick(boxes[active - 1].rows, picked);
  // 画面下のバーの文。warn が false なら普通の文字の色(成功の知らせ)
  function selMsg(text, warn = true) {
    const m = g('sel-msg');
    m.textContent = text;
    m.classList.toggle('ok', !warn);
    updateSelUi();
  }

  function updateSelUi() {
    const n = picked.size;
    g('sel-start').hidden = selectMode;
    g('box-count').hidden = selectMode;
    g('sel-tools').hidden = !selectMode;
    g('sel-count').textContent = `${n}匹選択中`;
    const hasMsg = !!g('sel-msg').textContent;
    g('sel-bar').hidden = !(selectMode && (n > 0 || hasMsg));
    for (const id of ['sel-copy', 'sel-move', 'sel-edit', 'sel-del']) g(id).disabled = n === 0;
    document.documentElement.classList.toggle('selecting', selectMode && (n > 0 || hasMsg));
    for (const c of g('box-grid').querySelectorAll('.cell')) {
      const on = selectMode && picked.has(Number(c.dataset.i));
      c.classList.toggle('chk', on);
      c.setAttribute('aria-pressed', selectMode ? String(on) : 'false');
    }
  }

  function startSelect() {
    closeMenus();
    selectMode = true;
    picked = new Set();
    g('sel-msg').textContent = '';
    updateSelUi();
  }

  function endSelect() {
    selectMode = false;
    picked = new Set();
    g('sel-msg').textContent = '';
    updateSelUi();
  }

  // 選んだ個体だけを、今のCSVの形でコピーする。確認が必要な個体を含むときは、コピーせず理由を出す
  async function selCopy() {
    const rows = pickedRows();
    const bad = rows.filter(Box.needsCheck).length;
    if (bad) { selMsg(`確認が必要な個体が${bad}匹含まれているので、コピーできません。直してからコピーしてください。`); return; }
    await writeClipboard(Box.csv(rows));
    selMsg(`${rows.length}匹をCSVにコピーしました。`, false);
  }

  // もう一方の BOX へ移す。入りきらなければ移さず、理由を出す。移した個体は元の BOX から消える
  function selMove() {
    const from = active, to = 3 - active;
    const idxs = [...picked];
    const moving = pickedRows();
    const plan = Box.canMove(moving.length, boxes[to - 1].rows.length);
    if (!plan.fits) { selMsg(`${nameOf(to)}にはあと${plan.room}匹しか入りません。${moving.length}匹は入らないので、移せません。`); return; }
    const dst = boxes[to - 1], src = boxes[from - 1];
    if (!Box.save(to, { name: dst.name, rows: dst.rows.concat(moving) })) { selMsg('保存できませんでした。端末の空き容量を確かめてください。'); return; }
    if (!Box.save(from, { name: src.name, rows: Box.removeMany(src.rows, idxs) })) {
      Box.save(to, { name: dst.name, rows: dst.rows }); // 元に戻す(二重にならないように)
      selMsg('保存できませんでした。端末の空き容量を確かめてください。');
      return;
    }
    boxes[to - 1] = Box.load(to);
    boxes[from - 1] = Box.load(from);
    picked = new Set();
    renderTabs();
    renderGrid();
    renderSave(okNow());
    selMsg(`${moving.length}匹を${nameOf(to)}へ移しました。`, false);
  }

  function selDelete() {
    const n = picked.size;
    ask(`${n}匹を消しますか？<b class="box-danger">この操作は取り消せません。</b>`, [
      { label: '消す', cls: 'danger', fn: () => {
        const data = boxes[active - 1];
        Box.save(active, { name: data.name, rows: Box.removeMany(data.rows, [...picked]) });
        boxes[active - 1] = Box.load(active);
        picked = new Set();
        renderTabs();
        renderGrid();
        renderSave(okNow());
        selMsg(`${n}匹を消しました。`, false);
      } },
      { label: 'やめる' },
    ]);
  }

  // 一括編集のダイアログ
  const bulkDlg = () => g('bulk-dialog');
  function openBulk() {
    g('bulk-level').value = '';
    g('bulk-ribbon').innerHTML = '<option value="">変えない</option>' + RIBBONS.map((h) => `<option value="${h}">${RIBBON_LABELS[h]}</option>`).join('');
    g('bulk-skill').innerHTML = '<option value="">変えない</option>' + [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<option value="${n}">Lv.${n}</option>`).join('');
    g('bulk-mint').value = '';
    g('bulk-shiny').value = '';
    g('bulk-warn').textContent = '';
    document.documentElement.classList.add('modal-open');
    if (typeof bulkDlg().showModal === 'function') bulkDlg().showModal(); else bulkDlg().setAttribute('open', '');
    g('bulk-title').focus({ preventScroll: true });
  }
  function closeBulk() {
    if (typeof bulkDlg().close === 'function' && bulkDlg().open) bulkDlg().close(); else bulkDlg().removeAttribute('open');
    document.documentElement.classList.remove('modal-open');
  }
  // 「変えない」(空)の項目は changes に入れない
  function readBulk() {
    const ch = {};
    const lv = g('bulk-level').value.trim();
    if (lv !== '') {
      const n = Number(lv);
      if (!Number.isInteger(n) || n < 1 || n > 100) return { error: 'レベルは1〜100で指定してください。' };
      ch.level = n;
    }
    if (g('bulk-ribbon').value !== '') ch.ribbon = Number(g('bulk-ribbon').value);
    if (g('bulk-skill').value !== '') ch.skillLevel = Number(g('bulk-skill').value);
    if (g('bulk-mint').value !== '') ch.mint = g('bulk-mint').value === '1';
    if (g('bulk-shiny').value !== '') ch.shiny = g('bulk-shiny').value === '1';
    if (!Object.keys(ch).length) return { error: '変える項目を選んでください(すべて「変えない」です)。' };
    return { ch };
  }
  function applyBulk() {
    const r = readBulk();
    if (r.error) { g('bulk-warn').textContent = r.error; return; }
    const n = picked.size;
    const data = boxes[active - 1];
    if (!Box.save(active, { name: data.name, rows: Box.bulkApply(data.rows, [...picked], r.ch) })) { g('bulk-warn').textContent = '保存できませんでした。端末の空き容量を確かめてください。'; return; }
    boxes[active - 1] = Box.load(active);
    picked = new Set();
    closeBulk();
    renderGrid();
    renderSave(okNow());
    selMsg(`${n}匹を一括編集しました。`, false);
  }

  // ---------- CSV の読み込み(いま見ている BOX へ直接追加する。ダイアログで貼り付ける) ----------
  const dlg = () => g('box-import-dialog');
  const clearImportMessages = () => {
    for (const id of ['box-import-warn', 'box-import-result']) g(id).textContent = '';
    g('box-import-problems').innerHTML = '';
  };

  function openImport() {
    closeMenus();
    closeAsk();
    g('box-import-title').textContent = `${nameOf(active)}にインポート`;
    g('box-import-text').value = '';
    clearImportMessages();
    g('box-import-done').textContent = '';
    document.documentElement.classList.add('modal-open'); // 後ろの画面がスクロールしないようにする
    if (typeof dlg().showModal === 'function') dlg().showModal(); // 後ろは暗くなり、押せなくなる
    else dlg().setAttribute('open', '');
    // showModal は最初に操作できる要素(貼り付け欄)へ自動でフォーカスを当て、キーボードが出てしまう。見出しに置く
    g('box-import-title').focus({ preventScroll: true });
  }

  function closeImport() {
    if (typeof dlg().close === 'function') dlg().close(); else dlg().removeAttribute('open');
    afterImportClosed();
  }

  // 閉じたら貼り付け欄は空にして、後ろのスクロールを戻す(閉じるボタン・背景・Esc のどれでも通る)
  function afterImportClosed() {
    document.documentElement.classList.remove('modal-open');
    g('box-import-text').value = '';
    clearImportMessages();
  }

  function importInto(text) {
    const n = active;
    const r = Import.parse(text);
    const count = r.rows.length;
    const data = boxes[n - 1];
    const plan = Box.plan(count, boxes.map((b) => b.rows.length))[n - 1];
    clearImportMessages();
    g('box-import-problems').innerHTML = r.problems.map((x) => `<li>${x.line ? `${x.line}行目: ` : ''}${esc(x.message)}</li>`).join('');
    // 1匹も入らないとき(全行エラー・上限超え)は閉じず、貼り付け欄の中身も残す(直して読み直せる)
    if (!count) { g('box-import-result').textContent = '読み込めた個体はありませんでした。'; return; }
    if (!plan.fits) {
      // 入りきらないときは1匹も入れない(4の保存と同じ判定)
      g('box-import-warn').textContent = `${nameOf(n)}にはあと${plan.room}匹しか入りません。${count}匹は入らないので、${nameOf(3 - n)}へ読み込むか、CSVの個体を減らしてください。`;
      return;
    }
    const rows = data.rows.concat(r.rows.map(Box.pack));
    if (!Box.save(n, { name: data.name, rows })) {
      g('box-import-warn').textContent = '保存できませんでした。端末の空き容量や、ブラウザの設定を確かめてください。';
      return;
    }
    boxes[n - 1] = Box.load(n);
    const check = r.rows.filter((x) => Box.needsCheck(Box.pack(x))).length;
    const done = `${count}匹を${nameOf(n)}に追加しました。${check ? `うち${check}匹は確認が必要です(オレンジ枠の箱を押して直してください)。` : ''}${r.problems.length ? ` 読めなかった行: ${r.problems.map((x) => `${x.line ? `${x.line}行目: ` : ''}${x.message}`).join(' ')}` : ''}`;
    closeImport(); // 成功したら閉じる(貼り付け欄も空になる)
    onlyFlag = false;
    renderAll();
    renderSave(okNow());
    g('box-import-done').textContent = done; // 結果は箱の並びの上に出す
  }

  // ---------- 絞り込み・並べ替えのパネル ----------
  const filterDlg = () => g('filter-dialog');
  function openFilter() {
    closeMenus();
    document.documentElement.classList.add('modal-open');
    if (typeof filterDlg().showModal === 'function') filterDlg().showModal(); else filterDlg().setAttribute('open', '');
    g('filter-title').focus({ preventScroll: true }); // 検索欄にフォーカスを当てない(キーボードを出さない)
  }
  function closeFilter() {
    if (typeof filterDlg().close === 'function' && filterDlg().open) filterDlg().close(); else filterDlg().removeAttribute('open');
    document.documentElement.classList.remove('modal-open');
  }
  // 絞り込みをすべて外す(並べ替えは追加順に戻す)
  function clearFilter() {
    g('box-filter').value = '';
    ingSel = '';
    sortKey = 'level';
    reverse = false;
    nickOnly = false;
    g('filter-nick').checked = false;
    typesSel = new Set();
    subsSel = new Set();
    onlyFlag = false;
    renderChips();
    firstPage();
  }
  function renderChips() {
    for (const c of g('filter-types').children) c.setAttribute('aria-pressed', String(typesSel.has(c.dataset.type)));
    for (const c of g('filter-subs').children) c.setAttribute('aria-pressed', String(subsSel.has(c.dataset.sub)));
    for (const c of g('filter-ings').children) c.setAttribute('aria-pressed', String(ingSel === c.dataset.ing));
    for (const c of g('filter-sorts').children) c.setAttribute('aria-pressed', String(sortKey === c.dataset.sort));
    // 項目の見出しに、いま絞っている数を出す
    const counts = { type: typesSel.size, ing: ingSel ? 1 : 0, sub: subsSel.size, nick: nickOnly ? 1 : 0 };
    const names = { type: 'タイプ', ing: '食材', sub: 'サブスキル', nick: 'ニックネーム' };
    for (const t of g('filter-tabs').children) t.textContent = counts[t.dataset.ft] ? `${names[t.dataset.ft]}(${counts[t.dataset.ft]})` : names[t.dataset.ft];
  }
  // タイプ・サブスキル(白・青・金の順)の選択肢を作る
  function buildChips() {
    g('filter-types').innerHTML = POKEMON_TYPES.map(([k, label]) => `<button type="button" class="chip" data-type="${k}" aria-pressed="false">${esc(label)}</button>`).join('');
    g('filter-ings').innerHTML = INGREDIENTS.map((n) => `<button type="button" class="chip ing" data-ing="${esc(n)}" aria-pressed="false"><span class="ico xs">${INGREDIENT_ICONS[n] ?? ''}</span>${esc(n)}</button>`).join('');
    g('filter-sorts').innerHTML = SORTS.map(([k, label]) => `<button type="button" class="chip" data-sort="${k}" aria-pressed="false">${esc(label)}</button>`).join('');
    g('sort-menu').innerHTML = SORTS.map(([k, label]) => `<button type="button" role="menuitem" data-sort="${k}">${esc(label)}</button>`).join('');
    g('filter-subs').innerHTML = ['white', 'blue', 'gold'].flatMap((color) => SUBSKILL_COLORS[color].map((name) => `<button type="button" class="chip ${color}" data-sub="${esc(name)}" aria-pressed="false">${esc(name)}</button>`)).join('');
  }

  function showFilterTab(ft) {
    for (const t of g('filter-tabs').children) t.setAttribute('aria-selected', String(t.dataset.ft === ft));
    for (const p of g('filter-dialog').querySelectorAll('.fpanel')) p.hidden = p.dataset.fp !== ft;
  }

  function init() {
    buildChips();
    g('filter-open').addEventListener('click', openFilter);
    g('filter-close').addEventListener('click', closeFilter);
    g('filter-clear').addEventListener('click', clearFilter);
    g('filter-dialog').addEventListener('click', (ev) => { if (ev.target === g('filter-dialog')) closeFilter(); });
    g('filter-dialog').addEventListener('cancel', () => document.documentElement.classList.remove('modal-open'));
    g('filter-dialog').addEventListener('close', () => document.documentElement.classList.remove('modal-open'));
    g('filter-types').addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-type]');
      if (!c) return;
      typesSel = typesSel.has(c.dataset.type) ? new Set([...typesSel].filter((x) => x !== c.dataset.type)) : new Set([...typesSel, c.dataset.type]);
      renderChips(); firstPage();
    });
    g('filter-subs').addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-sub]');
      if (!c) return;
      subsSel = subsSel.has(c.dataset.sub) ? new Set([...subsSel].filter((x) => x !== c.dataset.sub)) : new Set([...subsSel, c.dataset.sub]);
      renderChips(); firstPage();
    });
    g('filter-tabs').addEventListener('click', (ev) => { const t = ev.target.closest('[data-ft]'); if (t) showFilterTab(t.dataset.ft); });
    g('filter-ings').addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-ing]');
      if (!c) return;
      ingSel = ingSel === c.dataset.ing ? '' : c.dataset.ing;
      renderChips(); firstPage();
    });
    g('filter-nick').addEventListener('change', () => { nickOnly = g('filter-nick').checked; renderChips(); firstPage(); });
    const setSort = (k) => { sortKey = k; renderChips(); firstPage(); };
    g('filter-sorts').addEventListener('click', (ev) => { const c = ev.target.closest('[data-sort]'); if (c) setSort(c.dataset.sort); });
    g('sort-menu').addEventListener('click', (ev) => { const c = ev.target.closest('[data-sort]'); if (c) { closeMenus(); setSort(c.dataset.sort); } });
    g('sort-dir').addEventListener('click', () => { reverse = !reverse; firstPage(); });
    // 上のタブ
    g('tab-import').addEventListener('click', () => setTab('import'));
    g('tab-box').addEventListener('click', () => setTab('box'));
    for (const n of [1, 2]) g(`box-save-${n}`).addEventListener('click', () => save(n));
    g('box-guide').addEventListener('click', () => Install.guide());
    g('box-guide2').addEventListener('click', () => Install.guide());
    // BOX の切り替え・絞り込み・ページ送り
    g('box-tabs').addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-tab]');
      if (!t) return;
      active = Number(t.dataset.tab);
      onlyFlag = false;
      selected = null;
      endSelect(); // 選んだ番号は、別の BOX では意味がないので外す
      g('box-import-done').textContent = '';
      renderAll();
    });
    g('box-filter').addEventListener('input', firstPage);
    g('box-flag').addEventListener('click', () => { onlyFlag = !onlyFlag; firstPage(); });
    // 箱をタップしたメニュー(編集・削除)
    g('box-grid').addEventListener('click', (ev) => {
      const c = ev.target.closest('.cell');
      if (!c) return;
      ev.stopPropagation();
      const i = Number(c.dataset.i);
      if (selectMode) { picked = Box.toggleSelection(picked, i); g('sel-msg').textContent = ''; updateSelUi(); return; } // 選ぶ・外すを切り替える(メニューは出さない)
      if (selected === i) closeMenus(); else selectCell(i);
    });
    // 複数選択
    g('sel-start').addEventListener('click', startSelect);
    g('sel-end').addEventListener('click', endSelect);
    g('sel-all').addEventListener('click', () => { picked = Box.selectAll(Box.view(boxes[active - 1].rows, viewOpts()).order); g('sel-msg').textContent = ''; updateSelUi(); });
    g('sel-none').addEventListener('click', () => { picked = new Set(); g('sel-msg').textContent = ''; updateSelUi(); });
    g('sel-copy').addEventListener('click', selCopy);
    g('sel-move').addEventListener('click', selMove);
    g('sel-edit').addEventListener('click', openBulk);
    g('sel-del').addEventListener('click', selDelete);
    g('bulk-apply').addEventListener('click', applyBulk);
    g('bulk-close').addEventListener('click', closeBulk);
    g('bulk-dialog').addEventListener('click', (ev) => { if (ev.target === g('bulk-dialog')) closeBulk(); });
    g('bulk-dialog').addEventListener('cancel', () => document.documentElement.classList.remove('modal-open'));
    g('bulk-dialog').addEventListener('close', () => document.documentElement.classList.remove('modal-open'));
    g('ask-dialog').addEventListener('cancel', () => document.documentElement.classList.remove('modal-open'));
    g('ask-dialog').addEventListener('close', () => document.documentElement.classList.remove('modal-open'));
    g('cell-edit').addEventListener('click', () => { const i = selected; if (i !== null) openSheet(i); });
    g('cell-delete').addEventListener('click', deleteCell);
    g('cell-move').addEventListener('click', moveCell);
    g('cell-dup').addEventListener('click', duplicateCell);
    // メニューの外を押すと閉じる
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('.cell, #box-cell-menu, #box-more, #box-more-btn, #csv-menu, #csv-open, #sort-menu, #sort-open')) closeMenus();
    });
    // ⋯ のメニュー
    const toggleMenu = (btnId, menuId) => g(btnId).addEventListener('click', (ev) => {
      ev.stopPropagation();
      const open = g(menuId).hidden;
      closeMenus();
      g(menuId).hidden = !open;
      g(btnId).setAttribute('aria-expanded', String(open));
    });
    toggleMenu('box-more-btn', 'box-more');
    toggleMenu('csv-open', 'csv-menu');
    toggleMenu('sort-open', 'sort-menu');
    g('box-rename').addEventListener('click', () => { closeMenus(); rename(); });
    g('box-file').addEventListener('click', () => { closeMenus(); file(); });
    g('box-restore').addEventListener('click', () => { closeMenus(); restore(); });
    g('box-clear').addEventListener('click', () => { closeMenus(); clear(); });
    g('box-copy').addEventListener('click', () => { closeMenus(); copy(); });
    // 編集画面(全画面)。入力・進化・種族の検索は、3の行と同じ処理
    bindRowEvents(g('box-sheet'));
    g('box-sheet').addEventListener('click', (ev) => {
      const s = ev.target.closest('[data-lv-step]');
      if (s && sheet) stepLevel(Number(s.dataset.lvStep));
    });
    g('sheet-prev').addEventListener('click', () => moveSheet(-1));
    g('sheet-next').addEventListener('click', () => moveSheet(1));
    g('sheet-close').addEventListener('click', closeSheet);
    g('box-sheet').addEventListener('close', finishSheet);
    g('box-sheet').addEventListener('cancel', finishSheet); // Esc: 保存して後片付けをする(close でも同じ処理が通る)
    // CSV の読み込みのダイアログ
    g('box-import-open').addEventListener('click', openImport);
    g('box-import-close').addEventListener('click', closeImport);
    g('box-import-run').addEventListener('click', () => importInto(g('box-import-text').value));
    g('box-import-clip').addEventListener('click', async () => {
      let text = '', reason = '';
      // ボタンを押した処理の最初の await で呼ぶ(間に別の非同期処理を挟むと、iOS は利用者の操作と見なさず断ることがある)
      try { text = await navigator.clipboard.readText(); } catch (e) { text = null; reason = (e && e.name) || (navigator.clipboard ? '不明' : '使えないブラウザ'); }
      if (text === null || !text.trim()) {
        // 読めない・許可されない・空のとき: 閉じずに、貼り付け欄へ案内する(中身は残す)
        clearImportMessages();
        g('box-import-warn').textContent = Box.clipboardNotice(text, reason);
        return;
      }
      g('box-import-text').value = text; // 読めた内容を貼り付け欄に入れて、そのままインポートする(失敗したときは中身が残り、直せる)
      importInto(text);
    });
    // 暗い背景(ダイアログの外)を押したら閉じる。Esc で閉じたときも、後片付けをする
    dlg().addEventListener('click', (ev) => { if (ev.target === dlg()) closeImport(); });
    dlg().addEventListener('close', afterImportClosed);
    dlg().addEventListener('cancel', afterImportClosed); // Esc は cancel のあとに close になる。どちらでも片付ける
    // 「ファイルを選ぶ」は <label> が <input type=file> を包む形(タップがそのまま input に届く)。accept は付けない
    g('box-import-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      clearImportMessages();
      try {
        g('box-import-text').value = Import.decode(await file.arrayBuffer());
        g('box-import-result').textContent = `ファイル「${file.name}」の内容を貼り付け欄に入れました。確かめて「インポート」を押してください。`;
      } catch (e) { g('box-import-warn').textContent = `ファイルを読めませんでした: ${e.message}`; }
    });
    setTab(Box.loadTab(), false); // 前回のタブを開く
    renderAll();
    renderSave(okNow());
  }

  return { init, renderSave, renderAll, afterEdit, sheetHtml, setTab, _state: () => ({ boxes, active, restoredFrom, savedSig, sheet, selected, selectMode, picked }) };
})();

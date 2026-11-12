// BOX の画面。保存ボタン(取込みタブの4)と、BOX タブ(箱の並び・箱のメニュー・個体の編集画面・CSV の読み込み)
// ホーム画面に追加したアプリ(standalone)でだけ使える。ブラウザで開いたときは、保存ボタンを灰色にして、BOX タブには案内だけを出す
// app.js の state・loadRows・esc・ingredientField・evolutionField・selectField などを使うので、app.js より前に読み込み、app.js の最後で BoxUi.init() を呼ぶ
'use strict';

const BoxUi = (() => {
  let boxes = [Box.load(1), Box.load(2)];
  let active = 1;        // BOX タブで見ている BOX
  let restoredFrom = 0;  // 3 へ戻した元の BOX(0 なら戻していない)
  let page = 0;          // 箱の並びのページ(0始まり)。絞り込み・並べ替え・BOX の切り替えで1ページ目に戻る
  let onlyFlag = false;  // 要確認の個体だけを表示しているか
  let selected = null;   // 箱をタップして、メニューを出している個体の番号
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
    if (remember) Box.saveTab(name);
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

  const viewOpts = () => ({ query: g('box-filter').value, ingredient: g('box-ing').value, onlyFlag, sort: g('box-sort').value, page });
  const label = (a) => `${a[1] || '(種族なし)'}${a[0] ? `(${a[0]})` : ''}`;

  function renderGrid() {
    const data = boxes[active - 1];
    const v = Box.view(data.rows, viewOpts());
    page = v.page;
    if (onlyFlag && !v.flagged) onlyFlag = false; // 要確認がなくなったら、絞り込みを外す
    g('box-grid').innerHTML = v.items.map(({ a, i, flag }) => {
      const ings = a[4].map((n) => (n ? `<span class="ico xs" title="${esc(n)}">${INGREDIENT_ICONS[n] ?? ''}</span>` : '<span class="ico xs none">−</span>')).join('');
      return `<button type="button" class="cell${flag ? ' flag' : ''}${selected === i ? ' sel' : ''}" data-i="${i}" aria-label="${esc(label(a))}、Lv${a[2] ?? '?'}"><span class="c-lv"><i>Lv.</i>${a[2] ?? '?'}</span><b class="c-name">${esc(a[1] || '(未設定)')}</b><span class="c-nick">${esc(a[0]) || '&nbsp;'}</span><span class="c-ing">${ings}</span></button>`;
    }).join('');
    const total = data.rows.length;
    const flagged = v.flagged; // 辞書にない値などで、出力できない個体
    const fb = g('box-flag');
    fb.hidden = !flagged;
    fb.textContent = onlyFlag
      ? `オレンジ枠の${flagged}匹だけを表示中です。押すと、すべての個体の表示に戻ります。`
      : `確認が必要な個体が${flagged}匹あります。押すと、その個体だけを表示します。直すまで、CSVのコピー・保存(ファイル)はできません。`;
    const filtering = g('box-filter').value.trim() || g('box-ing').value || onlyFlag;
    g('box-count').textContent = (total === 0 ? 'このBOXは空です。' : filtering ? `${total}匹のうち${v.count}匹を表示しています。` : `${total}匹`)
      + (data.broken ? ' 保存の中身の一部を読めなかったため、読めた分だけを出しています。' : '');
    // ページ送り(1ページ40匹)。1ページに収まるときは出さない
    for (const id of ['box-pager-top', 'box-pager-bottom']) {
      const el = g(id);
      el.hidden = v.pages <= 1;
      el.innerHTML = `<button type="button" data-page="${v.page - 1}"${v.page === 0 ? ' disabled' : ''}>‹ 前へ</button><span>${v.page + 1}/${v.pages}</span><button type="button" data-page="${v.page + 1}"${v.page >= v.pages - 1 ? ' disabled' : ''}>次へ ›</button>`;
    }
    for (const id of ['box-restore', 'box-clear']) g(id).disabled = total === 0;
    for (const id of ['box-copy', 'box-file']) g(id).disabled = total === 0 || flagged > 0; // 3の4と同じく、直す項目が残っている間は出さない
    placeCellMenu();
  }

  // 絞り込み・並べ替えを変えたら1ページ目に戻る
  const firstPage = () => { page = 0; selected = null; renderGrid(); };

  function renderAll() {
    const on = enabled();
    g('box-app').hidden = !on;
    g('box-browser-note2').hidden = on;
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
    menu.style.top = `${cell.offsetTop + cell.offsetHeight + 4}px`;
  }

  function closeMenus() {
    if (selected !== null) { selected = null; for (const c of g('box-grid').querySelectorAll('.cell.sel')) c.classList.remove('sel'); }
    g('box-cell-menu').hidden = true;
    g('box-more').hidden = true;
    g('box-more-btn').setAttribute('aria-expanded', 'false');
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
    const idx = sheet.idx, order = sheet.order;
    sheet = null;
    document.documentElement.classList.remove('modal-open');
    page = Box.pageOf(order, idx);
    renderAll();
    renderSave(okNow());
  }

  function closeSheet() {
    const d = g('box-sheet');
    if (typeof d.close === 'function' && d.open) d.close(); else d.removeAttribute('open');
    finishSheet();
  }

  // ---------- 確認などの欄 ----------
  // buttons: [{ label, cls, fn }]
  function ask(html, buttons) {
    const el = g('box-confirm');
    el.hidden = false;
    el.innerHTML = `<p>${html}</p><div class="actions"></div>`;
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      if (b.cls) btn.className = b.cls;
      btn.addEventListener('click', () => { closeAsk(); if (b.fn) b.fn(); });
      el.lastChild.append(btn);
    }
    el.scrollIntoView({ block: 'nearest' });
  }
  const closeAsk = () => { g('box-confirm').hidden = true; g('box-confirm').innerHTML = ''; };

  function rename() {
    const el = g('box-confirm');
    el.hidden = false;
    el.innerHTML = `<label class="field"><span>BOXの名前(全角${Box.NAME_MAX}文字まで。空にすると「${esc(Box.defaultName(active))}」に戻ります)</span><input id="box-name" type="text" maxlength="${Box.NAME_MAX}" value="${esc(boxes[active - 1].name)}" placeholder="${esc(Box.defaultName(active))}" autocomplete="off"></label><div class="actions"><button type="button" id="box-name-ok" class="primary">決定</button><button type="button" id="box-name-cancel">やめる</button></div>`;
    g('box-name').focus();
    g('box-name-cancel').onclick = closeAsk;
    g('box-name-ok').onclick = () => {
      const data = boxes[active - 1];
      data.name = Box.cleanName(g('box-name').value);
      Box.save(active, data);
      boxes[active - 1] = Box.load(active);
      closeAsk();
      renderAll();
      renderSave(okNow());
    };
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

  async function copy() {
    const text = Box.csv(boxes[active - 1].rows);
    try { await navigator.clipboard.writeText(text); } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    g('box-copy').textContent = 'コピーしました';
    setTimeout(() => { g('box-copy').textContent = 'CSVをコピー'; }, 1500);
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
    page = 0; onlyFlag = false;
    renderAll();
    renderSave(okNow());
    g('box-import-done').textContent = done; // 結果は箱の並びの上に出す
  }

  function init() {
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
      page = 0;
      onlyFlag = false;
      selected = null;
      closeAsk();
      g('box-import-done').textContent = '';
      renderAll();
    });
    g('box-ing').innerHTML = '<option value="">食材</option>' + INGREDIENTS.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    g('box-filter').addEventListener('input', firstPage);
    g('box-ing').addEventListener('change', firstPage);
    g('box-sort').addEventListener('change', firstPage);
    g('box-flag').addEventListener('click', () => { onlyFlag = !onlyFlag; firstPage(); });
    for (const id of ['box-pager-top', 'box-pager-bottom']) {
      g(id).addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-page]');
        if (!b || b.disabled) return;
        page = Number(b.dataset.page);
        selected = null;
        renderGrid();
        if (id === 'box-pager-bottom') g('box-tabs').scrollIntoView({ block: 'start' }); // 下で送ったときは、先頭へ戻る
      });
    }
    // 箱をタップしたメニュー(編集・削除)
    g('box-grid').addEventListener('click', (ev) => {
      const c = ev.target.closest('.cell');
      if (!c) return;
      ev.stopPropagation();
      const i = Number(c.dataset.i);
      if (selected === i) closeMenus(); else selectCell(i);
    });
    g('cell-edit').addEventListener('click', () => { const i = selected; if (i !== null) openSheet(i); });
    g('cell-delete').addEventListener('click', deleteCell);
    // メニューの外を押すと閉じる
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('.cell, #box-cell-menu, #box-more, #box-more-btn')) closeMenus();
    });
    // ⋯ のメニュー
    g('box-more-btn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      const open = g('box-more').hidden;
      closeMenus();
      g('box-more').hidden = !open;
      g('box-more-btn').setAttribute('aria-expanded', String(open));
      if (open) {
        const b = g('box-more-btn');
        const m = g('box-more');
        m.style.top = `${b.offsetTop + b.offsetHeight + 4}px`;
        m.style.right = `${Math.max(0, b.offsetParent.clientWidth - (b.offsetLeft + b.offsetWidth))}px`;
      }
    });
    g('box-rename').addEventListener('click', () => { closeMenus(); rename(); });
    g('box-file').addEventListener('click', () => { closeMenus(); file(); });
    g('box-restore').addEventListener('click', () => { closeMenus(); restore(); });
    g('box-clear').addEventListener('click', () => { closeMenus(); clear(); });
    g('box-copy').addEventListener('click', copy);
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

  return { init, renderSave, renderAll, afterEdit, sheetHtml, setTab, _state: () => ({ boxes, active, restoredFrom, savedSig, sheet, selected, page }) };
})();

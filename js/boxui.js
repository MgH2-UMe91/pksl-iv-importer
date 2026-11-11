// BOX の画面。保存ボタン(4. エクスポート)と、中身を見る区画(5. BOX)
// ホーム画面に追加したアプリ(standalone)でだけ使える。ブラウザで開いたときは保存ボタンを灰色にして案内を出す
// app.js の state・loadRows・esc を使うので、app.js より前に読み込み、app.js の最後で BoxUi.init() を呼ぶ
'use strict';

const BoxUi = (() => {
  let boxes = [Box.load(1), Box.load(2)];
  let active = 1;        // 5 で見ている BOX
  let restoredFrom = 0;  // 3 へ戻した元の BOX(0 なら戻していない)
  let editing = null;    // 5 で開いている1匹の編集欄 { idx: BOX の中の番号, row: 編集中の行 }
  let savedSig = '';     // 最後に保存した(または戻した)ときの 3 の中身。違えば「保存していない行がある」
  const enabled = () => Install.standalone();
  const sig = () => JSON.stringify(state.rows.map(Box.pack));
  const unsaved = () => state.rows.length > 0 && sig() !== savedSig;
  const nameOf = (n) => Box.nameOf(boxes[n - 1], n);
  const g = (id) => document.getElementById(id);

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

  // ---- 5. BOX ----
  function renderTabs() {
    g('box-tabs').innerHTML = [1, 2].map((n) => `<button type="button" role="tab" aria-selected="${n === active}" data-tab="${n}" class="${n === active ? 'selected' : ''}">${esc(nameOf(n))} <small>${boxes[n - 1].rows.length}/${Box.MAX}</small></button>`).join('');
  }

  function renderList() {
    const data = boxes[active - 1];
    const q = Match.fold(g('box-filter').value.trim());
    const items = data.rows.map((a, i) => ({ a, i })).filter(({ a }) => !q || Match.fold(`${a[1]} ${a[0]}`).includes(q));
    const sort = g('box-sort').value;
    if (sort === 'newest') items.reverse();
    else if (sort === 'species') items.sort((x, y) => String(x.a[1]).localeCompare(String(y.a[1]), 'ja') || x.i - y.i);
    else if (sort === 'level') items.sort((x, y) => (y.a[2] ?? 0) - (x.a[2] ?? 0) || x.i - y.i);
    g('box-list').innerHTML = items.map(({ a, i }) => {
      const ings = a[4].map((n) => (n ? `<span class="ico sm" title="${esc(n)}" aria-label="${esc(n)}">${INGREDIENT_ICONS[n] ?? ''}</span>` : '<span class="ico sm none" title="未選択">−</span>')).join('');
      const who = `${esc(a[1])}${a[0] ? `(${esc(a[0])})` : ''}`;
      const open = editing && editing.idx === i;
      const flag = Box.needsCheck(a);
      return `<li data-i="${i}" class="${open ? 'open' : ''}${flag ? ' flag' : ''}"><div class="bhead" role="button" tabindex="0" aria-expanded="${!!open}" data-open="${i}" aria-label="${who}を編集する"><div class="bl1"><b>${esc(a[1] || '(種族なし)')}</b><span class="bnick">${esc(a[0])}</span><span class="blv">Lv${a[2] ?? '?'}</span></div><div class="bl2">${ings}<span class="bnat">${esc(a[5])}</span></div></div><button type="button" class="bx" data-del="${i}" aria-label="${who}を消す">✕</button></li>`;
    }).join('');
    if (editing) {
      const li = g('box-list').querySelector(`li[data-i="${editing.idx}"]`);
      if (li) mountEditor(li);
      else closeEdit(); // 絞り込みで見えなくなったときは閉じる
    }
    const total = data.rows.length;
    const flagged = data.rows.filter(Box.needsCheck).length; // 辞書にない値などで、出力できない個体
    g('box-flag').textContent = flagged ? `確認が必要な個体が${flagged}匹あります(オレンジ枠の行を押して直してください)。直すまで、CSVのコピー・保存(ファイル)はできません。` : '';
    g('box-count').textContent = (total === 0 ? 'このBOXは空です。' : q ? `${total}匹のうち${items.length}匹を表示しています。` : `${total}匹`)
      + (data.broken ? ' 保存の中身の一部を読めなかったため、読めた分だけを出しています。' : '');
    for (const id of ['box-restore', 'box-clear']) g(id).disabled = total === 0;
    for (const id of ['box-copy', 'box-file']) g(id).disabled = total === 0 || flagged > 0; // 3の4と同じく、直す項目が残っている間は出さない
  }

  // ---- 1匹ずつ直す ----
  // 3の行の編集欄(app.js の rowHtml)をそのまま使う。編集中の行は extraRows に登録して、入力・進化・種族の検索も同じ部品で動かす
  function mountEditor(li) {
    const row = editing.row;
    const box = document.createElement('div');
    box.className = 'box-edit';
    box.innerHTML = `<div class="row" data-id="${row.id}">${rowHtml(row, true)}</div><div class="actions box-edit-actions"><button type="button" id="box-edit-save" class="primary">保存</button><button type="button" id="box-edit-cancel">やめる</button></div>`;
    li.append(box);
    afterEdit(row);
    refreshRow(row, box.firstChild);
  }

  function openEdit(i) {
    closeEdit();
    const p = Box.unpack(boxes[active - 1].rows[i]);
    const row = Object.assign(newRow(), p, { manualLevel: Number.isFinite(p.level) ? p.level : null, readSkill: p.skillLevel });
    row.low = new Set(Box.lowKeys(row)); // 辞書にない値などの項目をオレンジ枠にする
    extraRows.set(row.id, row);
    editing = { idx: i, row };
    renderList();
    const li = g('box-list').querySelector(`li[data-i="${i}"]`);
    if (li) li.scrollIntoView({ block: 'nearest' });
  }

  function closeEdit() {
    if (!editing) return;
    extraRows.delete(editing.row.id);
    editing = null;
    for (const el of g('box-list').querySelectorAll('li.open')) { el.classList.remove('open'); el.querySelector('.box-edit')?.remove(); }
  }

  // 直す項目が残っている間は保存できない(3の4と同じ基準)
  function afterEdit(row) {
    const b = g('box-edit-save');
    if (b && editing && editing.row === row) b.disabled = Match.checkRow(row).errors.length > 0;
  }

  function saveEdit() {
    if (!editing || Match.checkRow(editing.row).errors.length) return;
    const data = boxes[active - 1];
    const rows = Box.replaceAt(data.rows, editing.idx, Box.pack(editing.row));
    if (!Box.save(active, { name: data.name, rows })) {
      g('box-count').textContent = '保存できませんでした。端末の空き容量や、ブラウザの設定を確かめてください。';
      return;
    }
    boxes[active - 1] = Box.load(active);
    closeEdit();
    renderAll();
    renderSave(okNow());
  }

  function renderAll() {
    g('box-section').hidden = !enabled();
    if (!enabled()) return;
    renderTabs();
    renderList();
    g('box-import-note').textContent = `このアプリで出したCSVと、個体値計算機のボックスからエクスポートしたCSV・TSVを、「${nameOf(active)}」に追加します(いまの中身は消えません。1つのBOXは${Box.MAX}匹まで)。辞書にない値のある個体も入り、オレンジ枠で直せます。`;
  }

  // 確認などの欄。buttons: [{ label, cls, fn }]
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
  }
  const closeAsk = () => { g('box-confirm').hidden = true; g('box-confirm').innerHTML = ''; };
  const okNow = () => !g('copy').disabled;

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
    closeEdit();
    const n = active;
    const go = () => {
      loadRows(boxes[n - 1].rows.map(Box.unpack));
      restoredFrom = n;
      savedSig = sig();
      renderSave(okNow());
      g('list-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (!unsaved()) { go(); return; }
    ask('3の一覧に、BOXに保存していない行があります。戻すと、その行は消えます。', [
      { label: '先にBOXへ保存する', cls: 'primary', fn: () => g('box-save').scrollIntoView({ behavior: 'smooth', block: 'center' }) },
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
    closeEdit();
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

  // ---- CSV の読み込み(いま見ている BOX へ直接追加する) ----
  function importInto(text) {
    const n = active;
    closeEdit();
    const r = Import.parse(text);
    const count = r.rows.length;
    const data = boxes[n - 1];
    const plan = Box.plan(count, boxes.map((b) => b.rows.length))[n - 1];
    g('box-import-problems').innerHTML = r.problems.map((x) => `<li>${x.line ? `${x.line}行目: ` : ''}${esc(x.message)}</li>`).join('');
    g('box-import-warn').textContent = '';
    g('box-import-result').textContent = '';
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
    renderAll();
    renderSave(okNow());
    g('box-import-result').textContent = `${count}匹を${nameOf(n)}に追加しました。${check ? `うち${check}匹は確認が必要です(リストのオレンジ枠の行を押して直してください)。` : ''}`;
  }

  function init() {
    for (const n of [1, 2]) g(`box-save-${n}`).addEventListener('click', () => save(n));
    g('box-guide').addEventListener('click', () => Install.guide());
    g('box-tabs').addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-tab]');
      if (!t) return;
      active = Number(t.dataset.tab);
      closeEdit();
      closeAsk();
      for (const id of ['box-import-warn', 'box-import-result']) g(id).textContent = '';
      g('box-import-problems').innerHTML = '';
      renderAll();
    });
    g('box-filter').addEventListener('input', renderList);
    g('box-sort').addEventListener('change', renderList);
    bindRowEvents(g('box-list')); // 編集欄の入力は、3の行と同じ処理
    g('box-list').addEventListener('click', (ev) => {
      if (ev.target.closest('#box-edit-save')) { saveEdit(); return; }
      if (ev.target.closest('#box-edit-cancel')) { closeEdit(); return; }
      const h = ev.target.closest('[data-open]');
      if (h) { const i = Number(h.dataset.open); if (editing && editing.idx === i) closeEdit(); else openEdit(i); return; }
      const d = ev.target.closest('[data-del]');
      if (!d) return;
      closeEdit(); // 番号がずれるので、開いている編集欄は先に閉じる
      const data = boxes[active - 1];
      data.rows.splice(Number(d.dataset.del), 1);
      Box.save(active, data);
      boxes[active - 1] = Box.load(active);
      renderAll();
      renderSave(okNow());
    });
    g('box-list').addEventListener('keydown', (ev) => {
      const h = ev.target.closest('[data-open]');
      if (h && (ev.key === 'Enter' || ev.key === ' ') && ev.target === h) { ev.preventDefault(); h.click(); }
    });
    g('box-import-open').addEventListener('click', () => {
      const open = g('box-import-panel').hidden;
      g('box-import-panel').hidden = !open;
      g('box-import-open').setAttribute('aria-expanded', String(open));
    });
    g('box-import-file').addEventListener('change', async (ev) => {
      const file = ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      try { importInto(Import.decode(await file.arrayBuffer())); }
      catch (e) { g('box-import-warn').textContent = `ファイルを読めませんでした: ${e.message}`; }
    });
    g('box-import-run').addEventListener('click', () => importInto(g('box-import-text').value));
    g('box-rename').addEventListener('click', rename);
    g('box-copy').addEventListener('click', copy);
    g('box-file').addEventListener('click', file);
    g('box-restore').addEventListener('click', restore);
    g('box-clear').addEventListener('click', clear);
    renderAll();
    renderSave(okNow());
  }

  return { init, renderSave, renderAll, afterEdit, _state: () => ({ boxes, active, restoredFrom, savedSig }) };
})();

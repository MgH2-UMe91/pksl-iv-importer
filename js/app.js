// 画面と状態
'use strict';

const LEVELS = [30, 50, 60, 70, 80];
const SKILL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
const $ = (id) => document.getElementById(id);

const state = { rows: [], bulkLevel: 60, bulkSkill: null, nextId: 1 }; // bulkSkill が null なら読み取った値を使う

function newRow(image = null) {
  return {
    id: state.nextId++, image,
    nickname: '', species: '', level: state.bulkLevel, skillLevel: '', readSkill: '',
    ing: ['', '', ''], nature: '', sub: ['', '', '', '', ''], shiny: false,
    low: new Set(), candidates: [], clues: null, icon: '', notes: [],
  };
}

// 読み取り結果を辞書に照合して行に入れる
function applyReading(row, read) {
  const sp = Match.species(read.name);
  row.species = sp.species;
  row.nickname = sp.nickname;
  row.candidates = sp.candidates;
  if (sp.confidence === 'low') row.low.add('species');

  const take = (key, m) => { if (m.confidence === 'low') row.low.add(key); return m.value; };
  row.nature = take('nature', Match.nature(read.nature));
  row.sub = read.sub.map((t, i) => take(`sub${i}`, Match.subskill(t, read.subColor[i])));
  row.skillLevel = row.readSkill = read.skillLevel ?? '';
  row.clues = read.clues;
  row.icon = read.icon;
  row.notes = read.warnings;
  applyIngredients(row);
}

// 種族が決まったら、読み取った手がかりからその種族の食材を判定する
function applyIngredients(row) {
  const { ing, low } = Match.ingredients(row.species, row.clues);
  row.ing = ing;
  row.low.delete('ing');
  if (low.length) row.low.add('ing');
}

function selectField(label, key, value, options) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  const opts = ['', ...list].map((o) => `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o) || '(なし)'}</option>`).join('');
  return `<label class="field" data-key="${key}"><span>${label}</span><select data-edit="${key}">${opts}</select></label>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function comboHtml(ing, amt) {
  return ing.map((g, i) => (g
    ? `<span class="slot"><span class="pic"><span class="ico">${INGREDIENT_ICONS[g]}</span><b>×${amt?.[i] ?? '?'}</b></span><small>${esc(g)}</small></span>`
    : '<span class="slot"><span class="pic">−</span><small>未選択</small></span>')).join('');
}

function ingredientField(row, own) {
  const p = Match.find(row.species);
  if (!p) return '<div class="field wide"><span>食材</span><p class="hint">ポケモンを選ぶと選べます</p></div>';
  // 幻のポケモンは組み合わせが多いので枠ごとに選ぶ
  if (p.myth) return [0, 1, 2].map((i) => selectField(`食材${i + 1}`, `ing${i}`, row.ing[i], own)).join('');
  const combos = Match.combos(row.species);
  const now = combos.find((c) => c.ing.join() === row.ing.join());
  return `<div class="field wide" data-key="ing"><span>食材</span>
    <button class="combo" type="button" data-combo-open aria-haspopup="listbox">${comboHtml(row.ing, now?.amt ?? combos[0].amt.slice(0, 1))}</button>
  </div>`;
}

function showCombos(button, row) {
  closeChoices();
  const ul = document.createElement('ul');
  ul.className = 'choices combo-list';
  ul.setAttribute('role', 'listbox');
  Match.combos(row.species).forEach((c) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', String(c.ing.join() === row.ing.join()));
    li.innerHTML = comboHtml(c.ing, c.amt);
    li.addEventListener('click', () => {
      row.ing = c.ing;
      row.low.delete('ing');
      closeChoices();
      renderRow(row);
    });
    ul.append(li);
  });
  button.parentElement.append(ul);
}

function rowHtml(row) {
  const own = Match.ingredientsOf(row.species) ?? INGREDIENTS;
  const thumb = row.image
    ? `<a href="${row.image}" target="_blank" rel="noopener"><img src="${row.icon || row.image}" alt="元のスクショを開く"></a>`
    : '<div class="empty">画像なし</div>';
  return `
    <div class="thumb">${thumb}</div>
    <div class="fields">
      <div class="field" data-key="species"><span>ポケモン</span>
        <input type="text" data-species value="${esc(row.species)}" placeholder="名前で検索" autocomplete="off">
      </div>
      <label class="field"><span>ニックネーム</span><input type="text" data-edit="nickname" value="${esc(row.nickname)}"></label>
      <label class="field"><span>レベル</span><input type="number" data-edit="level" min="1" max="100" value="${Number.isNaN(row.level) ? '' : row.level}"></label>
      <label class="field"><span>スキルレベル</span><input type="number" data-edit="skillLevel" min="1" max="8" value="${row.skillLevel}"></label>
      ${selectField('性格', 'nature', row.nature, NATURES)}
      ${ingredientField(row, own)}
      ${row.sub.map((s, i) => selectField(`サブスキル${i + 1}`, `sub${i}`, s, SUBSKILLS)).join('')}
      <label class="check"><input type="checkbox" data-edit="shiny"${row.shiny ? ' checked' : ''}>色違い</label>
    </div>
    <ul class="messages"></ul>
    <div class="row-end"><button class="remove" type="button" data-remove>この行を削除</button></div>`;
}

function addRow(row) {
  if (state.bulkSkill !== null) row.skillLevel = state.bulkSkill;
  state.rows.push(row);
  const el = document.createElement('div');
  el.className = 'row';
  el.dataset.id = row.id;
  el.innerHTML = rowHtml(row);
  $('rows').append(el);
  refresh();
}

function renderRow(row) {
  const el = $('rows').querySelector(`[data-id="${row.id}"]`);
  el.innerHTML = rowHtml(row);
  refresh();
}

function refresh() {
  const has = state.rows.length > 0;
  for (const id of ['level-section', 'list-section', 'export-section']) $(id).hidden = !has;

  const problems = [];
  state.rows.forEach((row, i) => {
    const { errors, warnings } = Match.checkRow(row);
    const el = $('rows').querySelector(`[data-id="${row.id}"]`);
    for (const f of el.querySelectorAll('[data-key]')) f.classList.toggle('low', row.low.has(f.dataset.key));
    el.querySelector('[data-key="species"]').classList.toggle('missing', !row.species);
    const notes = [...row.notes.map((t) => ['warning', t]), ...warnings.map((t) => ['warning', t]), ...errors.map((t) => ['error', t])];
    el.querySelector('.messages').innerHTML = notes.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('');
    for (const e of errors) problems.push(`${i + 1}匹目: ${e}`);
  });

  const ok = has && problems.length === 0;
  $('summary').textContent = ok ? `${state.rows.length}匹を出力できます。` : `${state.rows.length}匹のうち、直す項目が${problems.length}件あります。`;
  $('problems').innerHTML = problems.map((p) => `<li>${esc(p)}</li>`).join('');
  $('copy').disabled = $('save').disabled = !ok;
  // 直す項目が残っている間は中身も出さない
  $('preview').value = ok ? Csv.build(state.rows) : '';
}

function setLevel(level) {
  state.bulkLevel = level;
  for (const row of state.rows) row.level = level;
  for (const b of $('levels').children) b.classList.toggle('selected', Number(b.textContent.slice(2)) === level);
  for (const input of document.querySelectorAll('[data-edit="level"]')) input.value = level;
  refresh();
}

function setSkillLevel(level) {
  state.bulkSkill = level;
  for (const row of state.rows) {
    row.skillLevel = level ?? row.readSkill;
    $('rows').querySelector(`[data-id="${row.id}"] [data-edit="skillLevel"]`).value = row.skillLevel;
  }
  for (const b of $('skill-levels').children) b.classList.toggle('selected', b.dataset.level === String(level));
  refresh();
}

function setSpecies(row, name) {
  row.species = name;
  row.low.delete('species');
  row.candidates = [];
  const p = Match.find(name);
  if (p) {
    if (row.clues) applyIngredients(row);
    else {
      const own = p.myth ?? p.ing;
      row.ing = row.ing.map((g) => (own.includes(g) ? g : ''));
      if (!p.myth) row.ing[0] = p.ing[0]; // 1つ目の食材は種族で決まる
    }
  }
  renderRow(row);
}

async function addFiles(files) {
  const list = [...files];
  for (const [i, file] of list.entries()) {
    $('progress').textContent = `読み取り中 ${i + 1} / ${list.length}`;
    const row = newRow(URL.createObjectURL(file));
    try {
      applyReading(row, await Reader.read(file));
    } catch (e) {
      row.notes = [`読み取れませんでした: ${e.message}`];
    }
    addRow(row);
  }
  $('progress').textContent = `${list.length}枚を読み込みました`;
}

// ---------- 検索付きの選択欄 ----------
function closeChoices() {
  for (const ul of document.querySelectorAll('.choices')) ul.remove();
}

function showChoices(input, row) {
  closeChoices();
  const names = row.candidates.length && !input.value ? row.candidates : Match.search(input.value);
  if (!names.length) return;
  const ul = document.createElement('ul');
  ul.className = 'choices';
  for (const n of names) {
    const li = document.createElement('li');
    li.textContent = n;
    // blur より先に確定させる
    li.addEventListener('pointerdown', (ev) => { ev.preventDefault(); closeChoices(); setSpecies(row, n); });
    ul.append(li);
  }
  input.parentElement.append(ul);
}

const rowOf = (el) => state.rows.find((r) => r.id === Number(el.closest('.row').dataset.id));

function onEdit(ev) {
  const t = ev.target;
  const key = t.dataset.edit;
  if (!key) return;
  const row = rowOf(t);
  row.low.delete(key);
  if (key === 'level') row.level = t.value === '' ? NaN : Number(t.value);
  else if (key === 'skillLevel') row.skillLevel = t.value === '' ? '' : Number(t.value);
  else if (key === 'shiny') row.shiny = t.checked;
  else if (/^ing\d$/.test(key)) row.ing[key[3]] = t.value;
  else if (/^sub\d$/.test(key)) row.sub[key[3]] = t.value;
  else row[key] = t.value;
  refresh();
}

function init() {
  for (const level of LEVELS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `Lv${level}`;
    b.classList.toggle('selected', level === state.bulkLevel);
    b.addEventListener('click', () => setLevel(level));
    $('levels').append(b);
  }

  for (const level of [null, ...SKILL_LEVELS]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = level === null ? '読み取り値' : `Lv${level}`;
    b.dataset.level = String(level);
    b.classList.toggle('selected', level === null);
    b.addEventListener('click', () => setSkillLevel(level));
    $('skill-levels').append(b);
  }

  $('files').addEventListener('change', async (ev) => {
    await addFiles(ev.target.files);
    ev.target.value = '';
  });
  $('add').addEventListener('click', () => addRow(newRow()));

  const rows = $('rows');
  rows.addEventListener('input', onEdit);
  rows.addEventListener('change', onEdit);
  rows.addEventListener('input', (ev) => {
    if (!ev.target.matches('[data-species]')) return;
    const row = rowOf(ev.target);
    row.species = Match.find(ev.target.value) ? ev.target.value : '';
    showChoices(ev.target, row);
    refresh();
  });
  rows.addEventListener('focusin', (ev) => { if (ev.target.matches('[data-species]')) showChoices(ev.target, rowOf(ev.target)); });
  rows.addEventListener('focusout', (ev) => {
    if (!ev.target.matches('[data-species]')) return;
    closeChoices();
    const row = rowOf(ev.target);
    if (Match.find(ev.target.value)) setSpecies(row, ev.target.value);
  });
  document.addEventListener('click', (ev) => {
    const open = ev.target.closest('[data-combo-open]');
    if (open) {
      const shown = open.parentElement.querySelector('.combo-list');
      if (shown) closeChoices(); else showCombos(open, rowOf(open));
    } else if (!ev.target.closest('.choices') && !ev.target.matches('[data-species]')) closeChoices();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeChoices(); });
  rows.addEventListener('click', (ev) => {
    if (!ev.target.matches('[data-remove]')) return;
    const row = rowOf(ev.target);
    if (row.image) URL.revokeObjectURL(row.image);
    state.rows = state.rows.filter((r) => r !== row);
    ev.target.closest('.row').remove();
    refresh();
  });

  $('copy').addEventListener('click', async () => {
    const text = Csv.build(state.rows);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // クリップボードが使えない環境では選択して手動コピーできる状態にする
      $('preview').closest('details').open = true;
      $('preview').select();
      document.execCommand('copy');
    }
    $('copy').textContent = 'コピーしました';
    setTimeout(() => { $('copy').textContent = 'CSVをコピー'; }, 1500);
  });

  $('save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Csv.build(state.rows)], { type: 'text/csv' }));
    a.download = 'sleep-box.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

init();

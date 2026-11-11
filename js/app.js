// 画面と状態
'use strict';

const LEVELS = [30, 50, 60, 70, 80];
const SKILL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
const $ = (id) => document.getElementById(id);

const state = { rows: [], bulkLevel: null, bulkSkill: null, bulkSeed: false, bulkRibbon: null, bulkSpecies: '', nextId: 1 }; // bulkLevel と bulkSkill が null なら読み取った値を使う

// 3の一覧に入っていない行(BOX の編集欄で開いている1匹)。rowOf で見つけられるようにここに登録する
const extraRows = new Map();
const rowEl = (row) => document.querySelector(`.row[data-id="${row.id}"]`);

function newRow(image = null) {
  return {
    id: state.nextId++, image,
    nickname: '', species: '', level: NaN, readLevel: null, manualLevel: null, skillLevel: '', readSkill: '',
    ing: ['', '', ''], nature: '', sub: ['', '', '', '', ''], shiny: false, mint: false, ribbon: 0, seed: false, base: null, picked: false,
    low: new Set(), candidates: [], clues: null, icon: '', notes: [],
    shown: '',        // スクショに写っている種族。進化を選んでも変わらない(見本の保存と「進化する」の基準)
    pending: false,   // 「進化する」を入れたが、分岐があって進化先が決まっていない
  };
}

// 読み取り結果を辞書に照合して行に入れる
function applyReading(row, read) {
  const sp = Match.species(read.name);
  row.species = sp.species;
  row.shown = sp.confidence === 'high' ? sp.species : '';
  row.nickname = sp.nickname;
  row.candidates = sp.candidates;
  if (sp.confidence === 'low') row.low.add('species');
  if (!sp.species && !sp.nickname) row.low.add('nickname'); // 名前を読めなかった。どの個体か見分けられるよう確認を促す

  const take = (key, m) => { if (m.confidence === 'low') row.low.add(key); return m.value; };
  row.nature = take('nature', Match.nature(read.nature));
  row.sub = read.sub.map((t, i) => take(`sub${i}`, Match.subskill(t, read.subColor[i])));
  row.readLevel = read.level ?? null;
  if (read.level === null) row.low.add('level'); // 読めない、または範囲外のときは空欄にして印を付ける
  row.skillLevel = row.readSkill = read.skillLevel ?? '';
  if (read.skillLevel === null) row.low.add('skillLevel'); // 読めないときは黄色にして確認を促す
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

// long: 名前が長い選択欄。狭い画面では1列に広げて、名前の全体を読めるようにする
function selectField(label, key, value, options, long = false) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  const opts = ['', ...list].map((o) => `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o) || '(なし)'}</option>`).join('');
  return `<label class="field${long ? ' long' : ''}" data-key="${key}"><span>${label}</span><select data-edit="${key}">${opts}</select></label>`;
}

// 一緒に眠った時間のリボン(時間)。0 はなし
const RIBBONS = [0, 200, 500, 1000, 2000];
const RIBBON_LABELS = { 0: '200時間未満', 200: '200〜500時間', 500: '500〜1000時間', 1000: '1000〜2000時間', 2000: '2000時間以上' }; // CSV には各段階の下限の時間(0/200/500/1000/2000)を入れる

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
  if (p.myth) return [0, 1, 2].map((i) => selectField(`食材${i + 1}`, `ing${i}`, row.ing[i], own, true)).join('');
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

// 進化の選択。系統に複数の種族があるときだけ出す。「進化する」は、スクショの種族から最終進化形へ切り替える
function evolutionField(row) {
  const names = Match.line(row.species);
  if (names.length < 2) return '';
  const opts = names.map((n) => `<option value="${esc(n)}"${n === row.species ? ' selected' : ''}>${esc(n)}</option>`).join('');
  const from = Match.find(row.shown) ? row.shown : row.species;
  const canEvolve = Match.descendants(from).length > 0;
  const on = Match.descendants(from).includes(row.species) || row.pending;
  return `<div class="field evo${row.pending ? ' missing' : ''}" data-key="evolution">
      <select data-evo aria-label="進化の系統から選ぶ">${opts}</select>
      <label class="check"><input type="checkbox" data-evolve${on ? ' checked' : ''}${canEvolve ? '' : ' disabled'}>進化する</label>
    </div>`;
}

// box が true のときは、BOX の編集欄用(元のスクショの欄、銀種のチェック、「この行を削除」を出さない)
function rowHtml(row, box = false) {
  const own = Match.ingredientsOf(row.species) ?? INGREDIENTS;
  const thumb = row.image
    ? `<a href="${row.image}" target="_blank" rel="noopener"><img src="${row.icon || row.image}" alt="元のスクショを開く"></a>`
    : '<div class="empty">画像なし</div>';
  return `
    <div class="head${box ? ' nothumb' : ''}">
      ${box ? '' : `<div class="thumb">${thumb}</div>`}
      <div class="head-fields">
        <div class="field" data-key="species"><span>ポケモン</span>
          <input type="text" data-species value="${esc(row.species)}" placeholder="名前で検索" autocomplete="off">
        </div>
        ${evolutionField(row)}
        <label class="field" data-key="nickname"><span>ニックネーム</span><input type="text" data-edit="nickname" value="${esc(row.nickname)}"></label>
      </div>
    </div>
    <div class="fields">
      <label class="field" data-key="level"><span>レベル</span><input type="number" data-edit="level" min="1" max="100" value="${Number.isNaN(row.level) ? '' : row.level}"></label>
      <label class="field" data-key="skillLevel"><span>スキルレベル</span><input type="number" data-edit="skillLevel" min="1" max="8" value="${row.skillLevel}"></label>
      ${selectField('性格', 'nature', row.nature, NATURES)}
      <label class="check"><input type="checkbox" data-edit="shiny"${row.shiny ? ' checked' : ''}>色違い</label>
      <label class="check"><input type="checkbox" data-edit="mint"${row.mint ? ' checked' : ''}>ミント使用</label>
      <label class="field" data-key="ribbon"><span>一緒に眠った時間</span><select data-edit="ribbon">${RIBBONS.map((h) => `<option value="${h}"${h === row.ribbon ? ' selected' : ''}>${RIBBON_LABELS[h]}</option>`).join('')}</select></label>
      ${ingredientField(row, own)}
      ${row.sub.map((s, i) => selectField(`サブ${i + 1}`, `sub${i}`, s, SUBSKILLS, true)).join('')}
      ${box ? '' : `<div class="foot">
        <label class="check"><input type="checkbox" data-edit="seed"${row.seed ? ' checked' : ''}>銀種を使う</label>
        <button class="remove" type="button" data-remove>この行を削除</button>
      </div>`}
      <p class="field wide seed-note note" hidden></p>
    </div>
    <ul class="messages"></ul>`;
}

function addRow(row) {
  Install.dismiss();
  row.level = levelOf(row);
  if (state.bulkSkill !== null) row.skillLevel = state.bulkSkill;
  if (state.bulkSeed) Match.setSeed(row, true);
  if (state.bulkRibbon !== null) row.ribbon = state.bulkRibbon;
  state.rows.push(row);
  const el = document.createElement('div');
  el.className = 'row';
  el.dataset.id = row.id;
  el.innerHTML = rowHtml(row);
  $('rows').append(el);
  refresh();
}

// 3の一覧を、BOX から出した個体に置き換える。一括の指定は「読取」などの初期状態に戻す(値は各行に入っている)
function loadRows(list) {
  for (const r of state.rows) if (r.image) URL.revokeObjectURL(r.image);
  state.rows = [];
  $('rows').innerHTML = '';
  state.bulkLevel = null; state.bulkSkill = null; state.bulkSeed = false; state.bulkRibbon = null;
  for (const b of $('levels').children) b.classList.toggle('selected', b.dataset.level === 'null');
  for (const b of $('skill-levels').children) b.classList.toggle('selected', b.dataset.level === 'null');
  const frag = document.createDocumentFragment();
  for (const p of list) {
    const row = Object.assign(newRow(), p, { manualLevel: Number.isFinite(p.level) ? p.level : null, readSkill: p.skillLevel });
    row.low = new Set(Box.lowKeys(row));
    state.rows.push(row);
    const el = document.createElement('div');
    el.className = 'row';
    el.dataset.id = row.id;
    el.innerHTML = rowHtml(row);
    frag.append(el);
  }
  $('rows').append(frag);
  $('progress').textContent = '';
  refresh(); // 300匹でも1回だけ
}

function renderRow(row) {
  rowEl(row).innerHTML = rowHtml(row, extraRows.has(row.id));
  touch(row);
}

// 1行を直したあとの更新。3の行なら全体、BOX の編集欄の行ならその行だけ
function touch(row) {
  if (extraRows.has(row.id)) {
    refreshRow(row, rowEl(row));
    if (typeof BoxUi !== 'undefined') BoxUi.afterEdit(row);
  } else refresh();
}

// ---------- 種族が決まっていない個体の一括選択 ----------
const unresolvedRows = () => state.rows.filter((r) => !r.species);

// 選んだ個体すべてに同じ種族を入れる。1匹ずつ選んだときと同じ状態になる(食材などはそのあと選べる)
function applySpecies(rows, name) {
  for (const row of rows) {
    row.picked = false;
    setSpecies(row, name);
  }
}

function updateBulkApply() {
  const n = unresolvedRows().filter((r) => r.picked).length;
  const name = state.bulkSpecies;
  $('unresolved-apply').disabled = !(n > 0 && Match.find(name));
  $('unresolved-apply').textContent = n > 0 ? `${n}匹に適用` : '適用';
  $('unresolved-pick-count').textContent = `${n} / ${unresolvedRows().length}匹`;
}

let unresolvedSignature = '';
function renderUnresolved() {
  const list = unresolvedRows();
  $('unresolved').hidden = list.length === 0;
  if (!list.length) { unresolvedSignature = ''; return; }
  // 他の欄を編集するたびに作り直さない(検索欄の入力やスクロールを保つ)
  const signature = list.map((r) => `${r.id}:${r.picked}:${r.nickname}`).join('|');
  if (signature !== unresolvedSignature) {
    unresolvedSignature = signature;
    $('unresolved-list').innerHTML = list.map((r) => `
      <li><label>
        <input type="checkbox" data-pick="${r.id}"${r.picked ? ' checked' : ''}>
        ${r.icon ? `<img src="${r.icon}" alt="">` : '<span class="noimg">画像なし</span>'}
        <span class="nick">${r.nickname ? esc(r.nickname) : '(ニックネームなし)'}</span>
      </label></li>`).join('');
  }
  updateBulkApply();
}

function showBulkChoices(input) {
  closeChoices();
  const names = Match.search(input.value);
  if (!names.length) return;
  const ul = document.createElement('ul');
  ul.className = 'choices';
  for (const n of names) {
    const li = document.createElement('li');
    li.textContent = n;
    li.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      closeChoices();
      input.value = n;
      state.bulkSpecies = n;
      updateBulkApply();
    });
    ul.append(li);
  }
  input.parentElement.append(ul);
}

// 1行の表示を整える(印・色・銀種の説明・注意とエラー)。エラーの一覧を返す
function refreshRow(row, el) {
  const { errors, warnings } = Match.checkRow(row);
  for (const f of el.querySelectorAll('[data-key]')) {
    // レベルの印は「読取」のときだけ。一括の値を選んだら、その値が入っている
    f.classList.toggle('low', row.low.has(f.dataset.key) && !(f.dataset.key === 'level' && state.bulkLevel !== null && !extraRows.has(row.id)));
    const sub = /^sub(\d)$/.exec(f.dataset.key); // 青・金のサブスキルは選択欄の値に合わせて色を付ける
    if (sub) for (const c of ['blue', 'gold']) f.classList.toggle(c, SUBSKILL_COLORS[c].includes(row.sub[sub[1]]));
  }
  const changed = row.seed ? row.sub.map((s, k) => (s !== row.base[k] ? `${row.base[k]}→${s.slice(-1)}` : '')).filter(Boolean) : [];
  const seedNote = el.querySelector('.seed-note');
  seedNote.hidden = !row.seed;
  seedNote.textContent = changed.length ? `銀種で変わる: ${changed.join('、')}` : '銀種を使っても変わりません。';
  el.querySelector('[data-key="species"]').classList.toggle('missing', !row.species);
  const notes = [...row.notes.map((t) => ['warning', t]), ...warnings.map((t) => ['warning', t]), ...errors.map((t) => ['error', t])];
  el.querySelector('.messages').innerHTML = notes.map(([c, t]) => `<li class="${c}">${esc(t)}</li>`).join('');
  return errors;
}

function refresh() {
  renderUnresolved();
  const has = state.rows.length > 0;
  for (const id of ['level-section', 'list-section', 'export-section']) $(id).hidden = !has;

  const problems = [];
  state.rows.forEach((row, i) => {
    const errors = refreshRow(row, $('rows').querySelector(`[data-id="${row.id}"]`));
    for (const e of errors) problems.push(`${i + 1}匹目: ${e}`);
  });

  const bulk = $('seed-all');
  bulk.checked = has && state.rows.every((r) => r.seed);
  bulk.indeterminate = state.rows.some((r) => r.seed) && !bulk.checked;

  const common = has && state.rows.every((r) => r.ribbon === state.rows[0].ribbon) ? state.rows[0].ribbon : null;
  $('ribbon-all').value = common === null ? '' : String(common); // 行ごとに違うときは「1匹ずつ指定」を出す

  const ok = has && problems.length === 0;
  $('summary').textContent = ok ? `${state.rows.length}匹を出力できます。` : `${state.rows.length}匹のうち、直す項目が${problems.length}件あります。`;
  $('problems').innerHTML = problems.map((p) => `<li>${esc(p)}</li>`).join('');
  $('copy').disabled = $('save').disabled = !ok;
  // 直す項目が残っている間は中身も出さない
  $('preview').value = ok ? Csv.build(state.rows) : '';
  if (typeof BoxUi !== 'undefined') BoxUi.renderSave(ok);
}

// 行に入れるレベル。一括の値を選んでいればそれ、「読取」なら手で直した値、なければ読み取った値。どれもなければ空欄
const levelOf = (row) => state.bulkLevel ?? row.manualLevel ?? row.readLevel ?? NaN;

function setLevel(level) {
  state.bulkLevel = level;
  for (const row of state.rows) {
    row.level = levelOf(row);
    $('rows').querySelector(`[data-id="${row.id}"] [data-edit="level"]`).value = Number.isNaN(row.level) ? '' : row.level;
  }
  for (const b of $('levels').children) b.classList.toggle('selected', b.dataset.level === String(level));
  refresh();
}

function setSeedAll(on) {
  state.bulkSeed = on;
  for (const row of state.rows) {
    Match.setSeed(row, on);
    $('rows').querySelector(`[data-id="${row.id}"]`).innerHTML = rowHtml(row); // 選択欄を変化後の値にする
  }
  refresh();
}

function setRibbonAll(hours) {
  state.bulkRibbon = hours;
  for (const row of state.rows) {
    row.ribbon = hours;
    $('rows').querySelector(`[data-id="${row.id}"] [data-edit="ribbon"]`).value = hours;
  }
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

// 進化の系統から選ぶ。食材の名前は引き継ぎ、新しい種族に合わないものだけ空にする
function evolveTo(row, name) {
  row.species = name;
  row.pending = false;
  const p = Match.find(name);
  const own = p.myth ?? p.ing;
  row.ing = row.ing.map((g) => (own.includes(g) ? g : ''));
  if (!p.myth) row.ing[0] = p.ing[0];
  if (row.ing[1] && row.ing[1] === p.ing[2]) row.ing[1] = '';
  renderRow(row);
}

// 「進化する」。分岐がなければ最終進化形へ、あれば進化先を選ぶまで出力を止める。外すとスクショの種族に戻る
function setEvolve(row, on) {
  const from = Match.find(row.shown) ? row.shown : row.species;
  if (!on) { row.pending = false; evolveTo(row, from); return; }
  const finals = Match.finals(from);
  if (finals.length === 1) evolveTo(row, finals[0]);
  else { row.pending = true; row.species = from; renderRow(row); }
}

function setSpecies(row, name) {
  row.species = name;
  row.shown = name;
  row.pending = false;
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
  Install.dismiss();
  let failed = 0;
  for (const [i, file] of list.entries()) {
    const first = Reader.isPrepared() ? '' : '(初回は準備に時間がかかります)';
    $('progress').textContent = `読み取り中 ${i + 1} / ${list.length}${first}`;
    const row = newRow(URL.createObjectURL(file));
    try {
      applyReading(row, await Reader.read(file));
    } catch (e) {
      failed++;
      row.notes = [`読み取れませんでした: ${e.message}`];
    }
    addRow(row);
  }
  $('progress').textContent = failed ? `${list.length}枚のうち${failed}枚を読み取れませんでした` : `${list.length}枚を読み込みました`;
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

const rowOf = (el) => {
  const id = Number(el.closest('.row').dataset.id);
  return state.rows.find((r) => r.id === id) ?? extraRows.get(id);
};

function onEdit(ev) {
  const t = ev.target;
  const key = t.dataset.edit;
  if (!key) return;
  const row = rowOf(t);
  row.low.delete(key);
  if (key === 'level') {
    row.level = t.value === '' ? NaN : Number(t.value);
    row.manualLevel = t.value === '' ? null : row.level; // 一括の切り替えで「読取」に戻したときに使う
  }
  else if (key === 'skillLevel') row.skillLevel = t.value === '' ? '' : Number(t.value);
  else if (key === 'shiny') row.shiny = t.checked;
  else if (key === 'mint') row.mint = t.checked;
  else if (key === 'ribbon') row.ribbon = Number(t.value);
  else if (key === 'seed') { Match.setSeed(row, t.checked); renderRow(row); return; }
  else if (/^ing\d$/.test(key)) row.ing[key[3]] = t.value;
  else if (/^sub\d$/.test(key)) Match.editSub(row, Number(key[3]), t.value);
  else row[key] = t.value;
  touch(row);
}

// ホーム画面のアプリとして開いたとき。画面全体ではなく中身だけをスクロールさせる(css の .standalone)
function detectStandalone() {
  if (navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
    document.documentElement.classList.add('standalone');
  }
}

// 行の編集欄の操作(入力・進化・種族の検索)。3の一覧と、BOX の編集欄の両方に付ける
function bindRowEvents(rows) {
  rows.addEventListener('input', onEdit);
  rows.addEventListener('change', onEdit);
  rows.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-evo]')) evolveTo(rowOf(ev.target), ev.target.value);
    else if (ev.target.matches('[data-evolve]')) setEvolve(rowOf(ev.target), ev.target.checked);
  });
  rows.addEventListener('input', (ev) => {
    if (!ev.target.matches('[data-species]')) return;
    const row = rowOf(ev.target);
    const typed = Match.find(ev.target.value) ? ev.target.value : '';
    if (typed !== row.species) { row.shown = ''; row.pending = false; } // 入力が変わったら、確定は離れたときに行う
    row.species = typed;
    showChoices(ev.target, row);
    touch(row);
  });
  rows.addEventListener('focusin', (ev) => { if (ev.target.matches('[data-species]')) showChoices(ev.target, rowOf(ev.target)); });
  rows.addEventListener('focusout', (ev) => {
    if (!ev.target.matches('[data-species]')) return;
    closeChoices();
    const row = rowOf(ev.target);
    if (Match.find(ev.target.value) && (ev.target.value !== row.species || !row.shown)) setSpecies(row, ev.target.value);
  });
}

function init() {
  detectStandalone();
  for (const level of [null, ...LEVELS]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = level === null ? '読取' : String(level);
    b.dataset.level = String(level);
    if (level === null) b.setAttribute('aria-label', '読み取った値');
    b.classList.toggle('selected', level === state.bulkLevel);
    b.addEventListener('click', () => setLevel(level));
    $('levels').append(b);
  }

  for (const level of [null, ...SKILL_LEVELS]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = level === null ? '読取' : String(level);
    b.dataset.level = String(level);
    if (level === null) b.setAttribute('aria-label', '読み取った値');
    b.classList.toggle('selected', level === null);
    b.addEventListener('click', () => setSkillLevel(level));
    $('skill-levels').append(b);
  }

  $('seed-all').addEventListener('change', (ev) => setSeedAll(ev.target.checked));
  $('ribbon-all').innerHTML = `<option value="" disabled hidden>(1匹ずつ指定)</option>` + RIBBONS.map((h) => `<option value="${h}">${RIBBON_LABELS[h]}</option>`).join('');
  $('ribbon-all').addEventListener('change', (ev) => setRibbonAll(Number(ev.target.value)));

  // 種族が決まっていない個体の一括選択
  $('unresolved-list').addEventListener('change', (ev) => {
    const row = state.rows.find((r) => r.id === Number(ev.target.dataset.pick));
    if (!row) return;
    row.picked = ev.target.checked;
    unresolvedSignature = '';
    updateBulkApply();
  });
  $('unresolved-all').addEventListener('click', () => {
    for (const r of unresolvedRows()) r.picked = true;
    unresolvedSignature = '';
    renderUnresolved();
  });
  $('unresolved-none').addEventListener('click', () => {
    for (const r of unresolvedRows()) r.picked = false;
    unresolvedSignature = '';
    renderUnresolved();
  });
  const bulkInput = $('unresolved-species');
  bulkInput.addEventListener('input', () => {
    state.bulkSpecies = Match.find(bulkInput.value) ? bulkInput.value : '';
    showBulkChoices(bulkInput);
    updateBulkApply();
  });
  bulkInput.addEventListener('focus', () => showBulkChoices(bulkInput));
  $('unresolved-apply').addEventListener('click', () => {
    applySpecies(unresolvedRows().filter((r) => r.picked), state.bulkSpecies);
    bulkInput.value = '';
    state.bulkSpecies = '';
    refresh();
  });

  $('files').addEventListener('change', async (ev) => {
    await addFiles(ev.target.files);
    ev.target.value = '';
  });
  $('add').addEventListener('click', () => addRow(newRow()));

  const rows = $('rows');
  bindRowEvents(rows);
  document.addEventListener('click', (ev) => {
    const open = ev.target.closest('[data-combo-open]');
    if (open) {
      const shown = open.parentElement.querySelector('.combo-list');
      if (shown) closeChoices(); else showCombos(open, rowOf(open));
    } else if (!ev.target.closest('.choices') && !ev.target.matches('[data-species], #unresolved-species')) closeChoices();
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
BoxUi.init();
Install.init(() => state.rows.length > 0 || !!$('progress').textContent.startsWith('読み取り中'));

// オフライン対応。使えない環境でもそのまま動く
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}

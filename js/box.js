// BOX(端末の localStorage に残す保存先)。画面を持たない部分: 保存・読み出し・上限の判定・名前
// 文字の情報だけを残し、画像は保存しない。BOX は 2 つ、1 つにつき 300 匹まで
'use strict';

const Box = (() => {
  const MAX = 300;
  const COUNT = 2;
  const NAME_MAX = 10; // 全角で 10 文字まで
  const key = (n) => `iv-importer-box-${n}`;
  const defaultName = (n) => `BOX${n}`;

  // 名前に使う文字列を整える。改行は空白にし、10 文字までに切る。空なら '' (既定の名前に戻る)
  const cleanName = (s) => Array.from(String(s ?? '').replace(/[\r\n\t]+/g, ' ').trim()).slice(0, NAME_MAX).join('');
  const nameOf = (data, n) => data.name || defaultName(n);
  // ファイル名に使えない記号は _ にする
  const fileName = (name) => `${String(name).replace(/[\\/:*?"<>|]/g, '_')}.csv`;

  // 1 匹を短い配列にして保存する。順番: ニックネーム, 種族, レベル, スキルレベル, 食材×3, 性格, サブ×5, 色違い, ミント, 眠った時間
  // 銀種を使っている個体は、使った後のサブスキル(CSV に出る値)をそのまま保存し、銀種の印は残さない
  const pack = (row) => [
    row.nickname, row.species, Number.isFinite(row.level) ? row.level : null, row.skillLevel === '' ? null : row.skillLevel,
    row.ing.slice(0, 3), row.nature, row.sub.slice(0, 5), row.shiny ? 1 : 0, row.mint ? 1 : 0, row.ribbon || 0,
  ];
  const unpack = (a) => ({
    nickname: a[0], species: a[1], level: a[2] ?? NaN, skillLevel: a[3] ?? '',
    ing: [...a[4]], nature: a[5], sub: [...a[6]], shiny: a[7] === 1, mint: a[8] === 1, ribbon: a[9] || 0,
    seed: false, base: null, // 銀種を使った後のサブスキルが、その個体のサブスキルとして保存される。戻したときは銀種のチェックなしから始める
  });
  const valid = (a) => Array.isArray(a) && a.length >= 10 && Array.isArray(a[4]) && a[4].length === 3 && Array.isArray(a[6]) && a[6].length === 5;

  function load(n) {
    try {
      const raw = localStorage.getItem(key(n));
      if (raw === null) return { name: '', rows: [], broken: false };
      const o = JSON.parse(raw);
      const rows = Array.isArray(o?.rows) ? o.rows.filter(valid).slice(0, MAX) : [];
      return { name: cleanName(o?.name), rows, broken: !Array.isArray(o?.rows) || rows.length !== o.rows.length };
    } catch (e) { return { name: '', rows: [], broken: true }; }
  }
  // 保存できたら true。容量の上限などで失敗したら false
  function save(n, data) {
    try {
      localStorage.setItem(key(n), JSON.stringify({ v: 1, name: cleanName(data.name), rows: data.rows }));
      return true;
    } catch (e) { return false; }
  }
  const bytes = (n) => { try { const raw = localStorage.getItem(key(n)); return raw === null ? 0 : (key(n).length + raw.length) * 2; } catch (e) { return 0; } };

  // count 匹を各 BOX に保存できるか。overwrite はその BOX の中身を置き換える(3へ戻した元の BOX)
  // 返す値: BOX ごとの { fits, room }。room は追加で入る数(上書きなら 300)
  function plan(count, lengths, overwrite = 0) {
    return lengths.map((len, i) => {
      const room = overwrite === i + 1 ? MAX : MAX - len;
      return { fits: count <= room, room };
    });
  }

  // idx 番目の1匹だけを packed に替えた新しい配列を返す。並び順と件数は変えず、元の配列も変えない。範囲外なら何も変えない
  const replaceAt = (rows, idx, packed) => (Number.isInteger(idx) && idx >= 0 && idx < rows.length ? rows.map((r, i) => (i === idx ? packed : r)) : rows.slice());

  // 3の4と同じ基準で出力できない個体(辞書にない値、レベルなし など)か。CSV から読み込んだ個体が当てはまることがある
  const needsCheck = (packed) => Match.checkRow(unpack(packed)).errors.length > 0;
  // 要確認の個体で、オレンジ枠を付ける項目(3の行の data-key)
  const lowKeys = (row) => {
    const keys = [];
    if (!Match.find(row.species)) keys.push('species');
    if (!Number.isInteger(row.level) || row.level < 1 || row.level > 100) keys.push('level');
    if (row.nature && !NATURES.includes(row.nature)) keys.push('nature');
    row.sub.forEach((s, i) => { if (s && !SUBSKILLS.includes(s)) keys.push(`sub${i}`); });
    const own = Match.ingredientsOf(row.species);
    if (own && row.ing.some((g) => g && !own.includes(g))) keys.push('ing');
    return keys;
  };

  const PAGE_SIZE = 40; // 4列の箱の、4の倍数
  // 5 のリストに出す個体を決める。opts: { query, ingredient, onlyFlag, sort, page(0始まり) }
  // 返す値: { items: [{ a, i, flag }](このページ), count(絞り込み後の匹数), pages, page, flagged(BOX全体の要確認の数) }
  // 種族名 -> タイプ(data/pokemon.js)。データにない名前は undefined
  let typeMap = null;
  const typeOf = (name) => { if (!typeMap) typeMap = new Map(POKEMON.map((p) => [p.name, p.type])); return typeMap.get(name); };
  const TYPE_ORDER = POKEMON_TYPES.map((t) => t[0]);
  const typeRank = (name) => { const i = TYPE_ORDER.indexOf(typeOf(name)); return i < 0 ? 99 : i; };

  function view(rows, opts = {}) {
    const q = Match.fold(String(opts.query ?? '').trim());
    const all = rows.map((a, i) => ({ a, i, flag: needsCheck(a) }));
    const flagged = all.filter((x) => x.flag).length;
    const items = all.filter((x) => (!q || Match.fold(`${x.a[1]} ${x.a[0]}`).includes(q))
      && (!opts.ingredient || x.a[4].includes(opts.ingredient))
      && (!opts.types || !opts.types.length || opts.types.includes(typeOf(x.a[1]))) // 選んだタイプのどれか
      && (!opts.subs || !opts.subs.length || opts.subs.every((s) => x.a[6].includes(s))) // 選んだサブスキルをすべて持つ
      && (!opts.onlyFlag || x.flag));
    if (opts.sort === 'newest') items.reverse();
    else if (opts.sort === 'species') items.sort((x, y) => String(x.a[1]).localeCompare(String(y.a[1]), 'ja') || x.i - y.i);
    else if (opts.sort === 'type') items.sort((x, y) => typeRank(x.a[1]) - typeRank(y.a[1]) || String(x.a[1]).localeCompare(String(y.a[1]), 'ja') || x.i - y.i);
    else if (opts.sort === 'level') items.sort((x, y) => (y.a[2] ?? 0) - (x.a[2] ?? 0) || x.i - y.i);
    const size = opts.pageSize ?? PAGE_SIZE; // 画面は全匹をスクロールで見せるので、大きな値を渡す
    const pages = Math.max(1, Math.ceil(items.length / size));
    const page = Math.min(Math.max(0, opts.page ?? 0), pages - 1);
    return { items: items.slice(page * size, (page + 1) * size), total: rows.length, order: items.map((x) => x.i), count: items.length, pages, page, flagged };
  }

  // クリップボードから読めなかった・空だったときの案内。読めたなら ''
  // text が null なら読めなかった(許可されない・使えないブラウザ)。reason は NotAllowedError などの名前
  const clipboardNotice = (text, reason = '') => (text === null
    ? `クリップボードを読めませんでした${reason ? `(${reason})` : ''}。上の欄に長押しで貼り付けて「インポート」を押してください。`
    : !String(text).trim() ? 'クリップボードが空でした。CSVをコピーしてからもう一度押すか、上の欄に長押しで貼り付けて「インポート」を押してください。' : '');

  // 編集画面の ‹ › で移る先。order は今の並び・絞り込みの個体の番号(全ページ分)。端なら null
  const neighbor = (order, idx, delta) => {
    const p = order.indexOf(idx), q = p + delta;
    return p < 0 || q < 0 || q >= order.length ? null : order[q];
  };
  // その個体が何ページ目(0始まり)にあるか。編集画面を閉じたとき、その個体のページに戻る
  const pageOf = (order, idx) => { const p = order.indexOf(idx); return p < 0 ? 0 : Math.floor(p / PAGE_SIZE); };
  const removeAt = (rows, idx) => rows.filter((_, i) => i !== idx);

  // 性格の補正。[上がる項目, 下がる項目]。補正のない5つ(がんばりや・すなお・てれや・きまぐれ・まじめ)は含めない
  // 出どころ: ユーザーが出した一覧表(行が上がる項目、列が下がる項目。対角が補正なし)
  const SPEED = 'おてつだいスピード', ING = '食材おてつだい確率', SKILL = 'メインスキル発生確率', EXP = 'EXP獲得量', ENERGY = 'げんき回復量';
  const NATURE_FX = {
    'さみしがり': [SPEED, ENERGY], 'いじっぱり': [SPEED, ING], 'やんちゃ': [SPEED, SKILL], 'ゆうかん': [SPEED, EXP],
    'ずぶとい': [ENERGY, SPEED], 'わんぱく': [ENERGY, ING], 'のうてんき': [ENERGY, SKILL], 'のんき': [ENERGY, EXP],
    'ひかえめ': [ING, SPEED], 'おっとり': [ING, ENERGY], 'うっかりや': [ING, SKILL], 'れいせい': [ING, EXP],
    'おだやか': [SKILL, SPEED], 'おとなしい': [SKILL, ENERGY], 'しんちょう': [SKILL, ING], 'なまいき': [SKILL, EXP],
    'おくびょう': [EXP, SPEED], 'せっかち': [EXP, ENERGY], 'ようき': [EXP, ING], 'むじゃき': [EXP, SKILL],
  };
  const natureEffect = (name) => (NATURE_FX[name] ? { up: NATURE_FX[name][0], down: NATURE_FX[name][1] } : null);

  // 上のタブ(取込み / BOX)を覚える。使えない環境では、いつも取込みから始まる
  const TAB_KEY = 'iv-importer-tab';
  const loadTab = () => { try { const t = localStorage.getItem(TAB_KEY); return t === 'box' ? 'box' : 'import'; } catch (e) { return 'import'; } };
  const saveTab = (t) => { try { localStorage.setItem(TAB_KEY, t === 'box' ? 'box' : 'import'); } catch (e) { /* 覚えられなくても動く */ } };

  // ---- 箱の表示 ----
  // 種族名を、1行目(最初の6文字)と2行目(7文字目以降)に分ける。かなは全角幅なので、1行に6文字が入る大きさにしてある
  const splitName = (name, first = 6) => { const a = Array.from(String(name ?? '')); return { first: a.slice(0, first).join(''), rest: a.slice(first).join('') }; };

  // ---- 複数選択 ----
  // 選択(個体の番号の集まり)を切り替える。新しい Set を返し、元は変えない
  const toggleSelection = (sel, idx) => { const s = new Set(sel); if (s.has(idx)) s.delete(idx); else s.add(idx); return s; };
  const selectAll = (order) => new Set(order);
  // 選んだ個体(BOX の並びの順)
  const pick = (rows, idxs) => [...idxs].filter((i) => Number.isInteger(i) && i >= 0 && i < rows.length).sort((a, b) => a - b).map((i) => rows[i]);
  // 選んだ個体を除いた並び(残りの順番は変えない)
  const removeMany = (rows, idxs) => { const s = new Set(idxs); return rows.filter((_, i) => !s.has(i)); };
  // もう一方の BOX へ移せるか。入りきらなければ、入る数(room)を返して移さない
  const canMove = (count, dstLength) => { const room = MAX - dstLength; return { fits: count <= room, room }; };
  // 一括編集。changes に入っている項目だけを、選んだ個体に反映する(入っていない・undefined の項目は変えない)
  // changes: { level, skillLevel, ribbon, mint, shiny }
  const bulkApply = (rows, idxs, changes) => {
    const target = new Set(idxs);
    return rows.map((a, i) => {
      if (!target.has(i)) return a;
      const r = unpack(a);
      if (changes.level !== undefined) r.level = changes.level;
      if (changes.skillLevel !== undefined) r.skillLevel = changes.skillLevel;
      if (changes.ribbon !== undefined) r.ribbon = changes.ribbon;
      if (changes.mint !== undefined) r.mint = changes.mint;
      if (changes.shiny !== undefined) r.shiny = changes.shiny;
      return pack(r);
    });
  };

  const csv = (rows) => Csv.build(rows.map(unpack));

  return { MAX, COUNT, NAME_MAX, key, defaultName, cleanName, nameOf, fileName, pack, unpack, load, save, bytes, plan, replaceAt, needsCheck, lowKeys, view, typeOf, PAGE_SIZE, splitName, toggleSelection, selectAll, pick, removeMany, canMove, bulkApply, neighbor, pageOf, removeAt, natureEffect, NATURE_FX, loadTab, saveTab, TAB_KEY, clipboardNotice, csv };
})();

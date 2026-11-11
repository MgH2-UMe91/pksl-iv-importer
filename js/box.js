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

  const PAGE_SIZE = 30;
  // 5 のリストに出す個体を決める。opts: { query, ingredient, onlyFlag, sort, page(0始まり) }
  // 返す値: { items: [{ a, i, flag }](このページ), count(絞り込み後の匹数), pages, page, flagged(BOX全体の要確認の数) }
  function view(rows, opts = {}) {
    const q = Match.fold(String(opts.query ?? '').trim());
    const all = rows.map((a, i) => ({ a, i, flag: needsCheck(a) }));
    const flagged = all.filter((x) => x.flag).length;
    const items = all.filter((x) => (!q || Match.fold(`${x.a[1]} ${x.a[0]}`).includes(q))
      && (!opts.ingredient || x.a[4].includes(opts.ingredient))
      && (!opts.onlyFlag || x.flag));
    if (opts.sort === 'newest') items.reverse();
    else if (opts.sort === 'species') items.sort((x, y) => String(x.a[1]).localeCompare(String(y.a[1]), 'ja') || x.i - y.i);
    else if (opts.sort === 'level') items.sort((x, y) => (y.a[2] ?? 0) - (x.a[2] ?? 0) || x.i - y.i);
    const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const page = Math.min(Math.max(0, opts.page ?? 0), pages - 1);
    return { items: items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), count: items.length, pages, page, flagged };
  }

  // クリップボードから読み込むとき、読めなかった・空だったときの案内。読めたなら ''
  // text が null なら読めなかった(許可されない・使えないブラウザ)
  const clipboardNotice = (text) => (text === null
    ? 'クリップボードを読めませんでした。下の欄に長押しで貼り付けてください。'
    : !String(text).trim() ? 'クリップボードが空でした。CSVをコピーしてからもう一度押すか、下の欄に長押しで貼り付けてください。' : '');

  const csv = (rows) => Csv.build(rows.map(unpack));

  return { MAX, COUNT, NAME_MAX, key, defaultName, cleanName, nameOf, fileName, pack, unpack, load, save, bytes, plan, replaceAt, needsCheck, lowKeys, view, PAGE_SIZE, clipboardNotice, csv };
})();

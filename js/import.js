// CSV・TSV の読み込み。このアプリが出した CSV と、個体値計算機(nitoyon 氏)のボックスのエクスポートを受け付ける
// 相手の形式は、公開されているエクスポート・インポートの動作を読んで列名と値の書き方だけを合わせた(コードやデータは写していない)
//   - 1行目が列名。列名は英語名か日本語名。列の順番は問わない。メインスキルとお気に入りの列は読まない
//   - 食材は列ごとに食材名、サブスキルは Lv10/25/50/70/80 の5列、ribbon は時間(200/500/1000/2000 で段階が上がる)、mint・shiny は 1 か 0
//   - ポケモン・食材・性格・サブスキルは日本語名。英語名などは辞書にないので、その行はオレンジ枠にして3で直せるようにする
// 画面を持たない。画面側(app.js)が、返した個体を3の一覧に入れる
'use strict';

const Import = (() => {
  // 全角・半角をそろえ、空白を除いて小文字にする(列名と値の照合用)
  const norm = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();

  // 列名 → 項目。norm したあとの形で書く
  const HEADERS = {
    nickname: ['nickname', 'ニックネーム'],
    pokemon: ['pokemon', 'pokémon', 'ポケモン'],
    level: ['level', 'レベル'],
    skillLevel: ['skilllevel', 'スキルレベル'],
    ing0: ['ing1', 'ingredient1', '食材1'],
    ing1: ['ing2', 'ingredient2', '食材2'],
    ing2: ['ing3', 'ingredient3', '食材3'],
    nature: ['nature', 'せいかく', '性格'],
    sub0: ['lv10'], sub1: ['lv25'], sub2: ['lv50'], sub3: ['lv70'], sub4: ['lv80'],
    ribbon: ['ribbon', 'sleepingtimeshared', '一緒に眠った時間'],
    shiny: ['shiny', '色違い'],
    mint: ['mint', 'neutralizingmint', 'まっしろミント', 'ミント'],
  };
  const FIELD_OF = new Map();
  for (const [field, names] of Object.entries(HEADERS)) for (const n of names) FIELD_OF.set(norm(n), field);

  // 辞書(名前 → 名前)。norm した形で引く
  const dict = (names) => new Map(names.map((n) => [norm(n), n]));
  let maps = null;
  const lookups = () => (maps ??= {
    pokemon: dict(POKEMON.map((p) => p.name)),
    nature: dict(NATURES),
    sub: dict(SUBSKILLS),
    ing: dict(INGREDIENTS),
  });

  // 表を読む。引用符の中のカンマと改行は値の一部にする。line は各行の始まりの行番号(1始まり)
  function table(text, delim) {
    const rows = [];
    let cells = [], cell = '', i = 0, line = 1, start = 1, inQuote = false, quoteLine = 0, quoted = false;
    const endCell = () => { cells.push(cell); cell = ''; quoted = false; };
    const endRow = () => { endCell(); rows.push({ line: start, cells }); cells = []; start = line; };
    while (i < text.length) {
      const c = text[i];
      if (inQuote) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        if (c === '"') { inQuote = false; i++; continue; }
        if (c === '\n') line++;
        cell += c; i++; continue;
      }
      if (c === '"' && cell === '' && !quoted) { inQuote = true; quoted = true; quoteLine = line; i++; continue; }
      if (c === delim) { endCell(); i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { line++; i++; endRow(); continue; }
      cell += c; i++;
    }
    const broken = inQuote ? quoteLine : 0; // 引用符が閉じないまま終わった行
    if (!inQuote && (cell !== '' || cells.length)) endRow(); // 閉じていない行は個体にしない
    return { rows, broken };
  }

  const intOf = (s) => { const n = parseInt(String(s ?? '').normalize('NFKC').trim(), 10); return Number.isNaN(n) ? NaN : n; };
  const flag = (s) => { const v = norm(s); return v === '1' || v === 'true'; };
  // 一緒に眠った時間(時間)を、段階の下限(0/200/500/1000/2000)にする。相手のインポートと同じ区切り
  const ribbonOf = (s) => { const h = intOf(s); return !(h >= 0) ? 0 : h >= 2000 ? 2000 : h >= 1000 ? 1000 : h >= 500 ? 500 : h >= 200 ? 200 : 0; };

  // 返す値: { rows: 個体の配列, problems: [{ line, message }], header: 列名を読めたか }
  // 個体: 3の行に入れる項目 + low(オレンジ枠にする項目の名前) + notes(注意の文) + line(元の行番号)
  function parse(text) {
    const result = { rows: [], problems: [], header: false };
    let src = String(text ?? '').replace(/^﻿/, '');
    if (!src.trim()) { result.problems.push({ line: 0, message: '中身が空です。' }); return result; }
    const first = src.split('\n').find((l) => l.trim() !== '') ?? '';
    if (/^[A-Za-z0-9+-]{12,16}(\.|@|$)/.test(first.trim())) {
      result.problems.push({ line: 1, message: '個体値計算機の「テキスト形式」には対応していません。CSV(または TSV)でエクスポートしたものを読み込んでください。' });
      return result;
    }
    const { rows: all, broken } = table(src, first.includes('\t') ? '\t' : ',');
    const lines = all.filter((r) => r.cells.some((c) => c.trim() !== ''));
    if (!lines.length) { result.problems.push({ line: 0, message: '中身が空です。' }); return result; }
    const head = lines[0];
    const col = {};
    head.cells.forEach((h, i) => { const f = FIELD_OF.get(norm(h)); if (f && col[f] === undefined) col[f] = i; });
    if (col.pokemon === undefined) {
      result.problems.push({ line: head.line, message: '1行目に列名(ポケモン / Pokemon など)が見つかりません。1行目が列名のCSVを読み込んでください。' });
      return result;
    }
    result.header = true;
    const get = (cells, f) => (col[f] === undefined ? '' : String(cells[col[f]] ?? '').trim());
    const m = lookups();

    for (const { line, cells } of lines.slice(1)) {
      const low = [], notes = [];
      const name = get(cells, 'pokemon'), nick = get(cells, 'nickname');
      let species = '';
      if (name) {
        species = m.pokemon.get(norm(name)) ?? '';
        if (!species) { low.push('species'); notes.push(`ポケモン名「${name}」が辞書にありません。選び直してください。`); }
      } else {
        low.push('species'); notes.push('ポケモン名が空です。選んでください。');
      }
      const level = intOf(get(cells, 'level'));
      if (Number.isNaN(level)) { low.push('level'); notes.push('レベルを読めませんでした。入れてください。'); }
      const sk = intOf(get(cells, 'skillLevel'));
      const skillLevel = Number.isNaN(sk) ? '' : sk;

      const p = species ? POKEMON.find((x) => x.name === species) : null;
      const ing = [0, 1, 2].map((i) => {
        const raw = get(cells, `ing${i}`);
        if (!raw) return '';
        const g = m.ing.get(norm(raw));
        if (!g) { low.push('ing'); notes.push(`食材${i + 1}「${raw}」が辞書にありません。`); return raw; }
        return g;
      });
      // 1つ目の食材は種族で決まる(相手のインポートも、食材1は見ずに種族から決める)
      if (p && !p.myth && p.ing && ing[0] && ing[0] !== p.ing[0]) ing[0] = p.ing[0];
      else if (p && !p.myth && p.ing && !ing[0]) ing[0] = p.ing[0];

      const natureRaw = get(cells, 'nature');
      let nature = '';
      if (natureRaw) {
        nature = m.nature.get(norm(natureRaw)) ?? natureRaw;
        if (!m.nature.has(norm(natureRaw))) { low.push('nature'); notes.push(`性格「${natureRaw}」が辞書にありません。`); }
      }
      const sub = [0, 1, 2, 3, 4].map((i) => {
        const raw = get(cells, `sub${i}`);
        if (!raw) return '';
        const s = m.sub.get(norm(raw));
        if (!s) { low.push(`sub${i}`); notes.push(`サブスキル${i + 1}「${raw}」が辞書にありません。`); return raw; }
        return s;
      });
      result.rows.push({
        line, nickname: nick, species, level, skillLevel, ing, nature, sub,
        shiny: flag(get(cells, 'shiny')), mint: flag(get(cells, 'mint')), ribbon: ribbonOf(get(cells, 'ribbon')),
        low, notes,
      });
    }
    if (broken) result.problems.push({ line: broken, message: '引用符(")が閉じていません。ここから先は読めませんでした。' });
    if (!result.rows.length && !result.problems.length) result.problems.push({ line: 0, message: '個体の行がありません(1行目は列名です)。' });
    return result;
  }

  // ファイルの中身(バイト列)を文字にする。UTF-8 で読めなければ Shift_JIS(Excel の保存など)として読む
  function decode(buffer) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch (e) { /* 次へ */ }
    try { return new TextDecoder('shift_jis').decode(buffer); } catch (e) { return new TextDecoder('utf-8').decode(buffer); }
  }

  return { parse, decode, table };
})();

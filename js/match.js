// 読み取った文字を辞書に照合する。OCRの誤字を許す近似一致と、ニックネームの判定
'use strict';

const Match = (() => {
  // 見た目が似ていてOCRが取り違える文字をそろえる
  const LOOKALIKE = {
    '一': 'ー', '―': 'ー', '—': 'ー', '–': 'ー', '-': 'ー', '−': 'ー', '‐': 'ー', '~': 'ー',
    '力': 'か', '口': 'ろ', '二': 'に', '卜': 'と', '夕': 'た', '工': 'え', '八': 'は', '才': 'お', '千': 'ち', '三': 'み',
    'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
  };

  function fold(s) {
    let out = '';
    for (const ch of String(s ?? '').normalize('NFKC').replace(/[\s|]/g, '').toUpperCase()) {
      const c = ch.codePointAt(0);
      const hira = c >= 0x30a1 && c <= 0x30f6 ? String.fromCodePoint(c - 0x60) : ch; // カタカナ→ひらがな
      out += LOOKALIKE[hira] ?? hira;
    }
    return out;
  }

  function distance(a, b) {
    const A = [...a], B = [...b];
    let prev = [0, ...B.map((_, i) => i + 1)];
    for (let i = 1; i <= A.length; i++) {
      const cur = [i];
      for (let j = 1; j <= B.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[B.length];
  }

  // 一番近い候補を返す。maxDist(len) を超えるか、同じ近さの候補が別にあれば null
  function best(text, list, maxDist) {
    const t = fold(text);
    if (!t) return null;
    let top = null, tie = false;
    for (const value of list) {
      const f = fold(value);
      const d = distance(t, f);
      if (!top || d < top.d) { top = { value, d, len: [...f].length }; tie = false; }
      else if (d === top.d) tie = true;
    }
    if (!top || tie || top.d > maxDist(top.len)) return null;
    return { value: top.value, exact: top.d === 0 };
  }

  const loose = (len) => Math.floor(len / 3);                // 3文字に1字まで
  const strict = (len) => (len <= 3 ? 0 : len <= 5 ? 1 : 2); // 種族名は短いほど厳しく

  const result = (m) => (m ? { value: m.value, confidence: m.exact ? 'high' : 'low' } : { value: '', confidence: 'none' });

  const find = (name) => POKEMON.find((p) => p.name === name) ?? null;
  function ingredientsOf(name) {
    const p = find(name);
    return p ? p.myth ?? p.ing : null;
  }

  const nature = (text) => result(best(text, NATURES, loose));

  // サブスキルは背景色ごとに候補が決まる。S/Mの読み違いをここで防ぐ
  function subskill(text, color) {
    const m = best(text, SUBSKILL_COLORS[color] ?? SUBSKILLS, loose);
    if (m) return result(m);
    const any = best(text, SUBSKILLS, loose);
    return any ? { value: any.value, confidence: 'low' } : result(null);
  }

  // 絵の比較でこの値以上なら同じ食材とみなす
  const SAME = 0.95;

  // 種族が取りうる食材の組み合わせ。[{ ing: [3], amt: [3] }]
  function combos(species) {
    const p = find(species);
    if (!p || p.myth) return [];
    const [a, b, c] = p.ing;
    const [a30, b30, a60, b60, c60] = p.amt;
    const first = a30 >= 4 ? 2 : 1; // 得意なものが食材の種族は最初から2個
    const seconds = [[a, a30], [b, b30]];
    const thirds = [[a, a60], [b, b60], ...(c ? [[c, c60]] : [])];
    return seconds.flatMap(([g2, n2]) => thirds.map(([g3, n3]) => ({ ing: [a, g2, g3], amt: [first, n2, n3] })));
  }

  // 詳細画面の手がかり(個数と隣の枠との絵の比較)から、種族の食材のどれかを決める。
  // 戻り値 { ing: [3], low: [自信の低い枠の番号] }
  function ingredients(species, clues) {
    const p = find(species);
    if (!p || p.myth || !clues) return { ing: ['', '', ''], low: [] };
    const [a, b, c] = p.ing;
    const [a30, b30, a60, b60, c60] = p.amt;
    const low = [];
    const byAmount = (options, n) => {
      const hit = options.filter((o) => o.n === n);
      return n !== null && hit.length ? hit : options;
    };

    // 2番目の枠
    let opts = byAmount([{ g: a, n: a30 }, { g: b, n: b30 }], clues.amount[0]);
    let second;
    if (opts.length === 1) second = opts[0].g;
    else if (clues.s21 === null) { second = b; low.push(1); }
    else second = clues.s21 >= SAME ? a : b;

    // 3番目の枠
    opts = byAmount([{ g: a, n: a60 }, { g: b, n: b60 }, ...(c ? [{ g: c, n: c60 }] : [])], clues.amount[1]);
    if (opts.length > 1) {
      const sameSecond = clues.s32 >= SAME;
      const same = opts.filter((o) => (o.g === second ? sameSecond : o.g === a ? clues.s31 >= SAME : false));
      const rest = opts.filter((o) => o.g !== second && !(o.g === a && clues.s31 !== null));
      if (same.length === 1) opts = same;
      else if (rest.length >= 1 && !sameSecond) opts = rest;
    }
    if (opts.length > 1) low.push(2);
    return { ing: [a, second, opts[0].g], low };
  }

  const speciesNames = POKEMON.map((p) => p.name);
  const baseName = (name) => name.replace(/\(.*$/, '');

  // 読み取った名前を種族名として判定する。一致しなければニックネームとして残す
  function species(raw) {
    const text = String(raw ?? '').trim();
    if (!text) return { species: '', nickname: '', confidence: 'none', candidates: [] };
    // 「バケッチャ」のように姿違いしか辞書にない名前は、種族名だが姿を選ぶ必要がある
    const folded = fold(text);
    const forms = speciesNames.filter((n) => n !== baseName(n) && fold(baseName(n)) === folded);
    if (forms.length && !speciesNames.some((n) => fold(n) === folded)) {
      return { species: '', nickname: '', confidence: 'none', candidates: forms };
    }
    const m = best(text, speciesNames, strict);
    if (m) return { species: m.value, nickname: '', confidence: m.exact ? 'high' : 'low', candidates: [] };
    return { species: '', nickname: text, confidence: 'none', candidates: [] };
  }

  // 検索付きの選択欄の絞り込み(ひらがなでも引ける)
  function search(query, limit = 30) {
    const q = fold(query);
    if (!q) return speciesNames.slice(0, limit);
    const head = [], mid = [];
    for (const n of speciesNames) {
      const i = fold(n).indexOf(q);
      if (i === 0) head.push(n); else if (i > 0) mid.push(n);
    }
    return head.concat(mid).slice(0, limit);
  }

  // エクスポートの可否を決める。errors が1つでもあれば出さない
  function checkRow(row) {
    const errors = [], warnings = [];
    if (!find(row.species)) errors.push('ポケモンを選んでください');
    if (!Number.isInteger(row.level) || row.level < 1 || row.level > 100) errors.push('レベルは1〜100で指定してください');
    if (row.skillLevel !== '' && row.skillLevel !== undefined && (!Number.isInteger(row.skillLevel) || row.skillLevel < 1 || row.skillLevel > 8)) errors.push('スキルレベルは1〜8で指定してください');
    if (row.nature && !NATURES.includes(row.nature)) errors.push(`性格「${row.nature}」は辞書にありません`);
    row.sub.forEach((s, i) => { if (s && !SUBSKILLS.includes(s)) errors.push(`サブスキル${i + 1}「${s}」は辞書にありません`); });
    const own = ingredientsOf(row.species);
    if (own) {
      // 取り込み先は種族に合わない食材を警告なしで別の食材に置き換えるので、ここで止める
      row.ing.forEach((g, i) => { if (g && !own.includes(g)) errors.push(`食材${i + 1}「${g}」は${row.species}の食材ではありません`); });
      const p = find(row.species);
      if (!p.myth) {
        if (row.ing[0] && own.includes(row.ing[0]) && row.ing[0] !== p.ing[0]) errors.push(`食材1は${p.ing[0]}のはずです`);
        if (row.ing[1] && p.ing[2] && row.ing[1] === p.ing[2]) errors.push(`食材2に${p.ing[2]}は入りません`);
      }
    }
    if (!row.nature) warnings.push('性格が空です(取り込むと「てれや」になります)');
    if (row.level >= 30 && !row.ing[1]) warnings.push('食材2が空です');
    if (row.level >= 60 && !row.ing[2]) warnings.push('食材3が空です');
    return { errors, warnings };
  }

  return { fold, distance, best, species, nature, subskill, ingredients, combos, ingredientsOf, search, checkRow, find };
})();

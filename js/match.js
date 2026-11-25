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
  // 食材を自動で決めない種族の、最初から持っている(固定の)食材。個体値計算機のデータと同じ。ほかの枠はひらめきの種で解放するまで「なし」
  const MYTH_FIXED = { 'ミュウ': ['とくせんエッグ', 'げきからハーブ', ''], 'ダークライ': ['マメミート', '', ''] };
  // 固定の枠が空なら入れる。別の値が入っていれば上書きしない
  const fillMyth = (species, ing) => { const f = MYTH_FIXED[species]; return f ? [0, 1, 2].map((i) => ing[i] || f[i]) : [...ing]; };

  function ingredientsOf(name) {
    const p = find(name);
    return p ? p.myth ?? p.ing : null;
  }

  // 性格。OCRが文字を足して読むことがある(「おくびょう」→「おくびぴびょう」)ので、
  // 近似一致で決まらなければ、辞書の名前が(間に文字を挟んでも)順に含まれ、足された文字が2字までで、1つに決まるものを採る
  function nature(text) {
    const m = best(text, NATURES, loose);
    if (m) return result(m);
    const t = [...fold(text)];
    // 頭の3文字が1つの性格にだけ一致すれば採る(25種の頭3文字は、小書き文字をそろえても重ならない)
    if (t.length >= 3) {
      const head = t.slice(0, 3).join('');
      const same = NATURES.filter((n) => [...fold(n)].slice(0, 3).join('') === head);
      if (same.length === 1) return { value: same[0], confidence: 'low' };
    }
    const hits = NATURES.filter((n) => {
      const f = [...fold(n)];
      if (f.length < 4 || t.length > f.length + 2) return false;
      let i = 0;
      for (const ch of t) if (ch === f[i]) i++;
      return i === f.length;
    });
    return hits.length === 1 ? { value: hits[0], confidence: 'low' } : result(null);
  }

  // サブスキルは背景色ごとに候補が決まる。S/Mの読み違いをここで防ぐ
  function subskill(text, color) {
    const m = best(text, SUBSKILL_COLORS[color] ?? SUBSKILLS, loose);
    const any = best(text, SUBSKILLS, loose);
    if (m) {
      // 背景色の候補の中で1つに絞れ、色を問わない候補でも同じ値になるなら、文字の余計な誤読は気にしない
      // (「おてつだいスピードS$S」のように、正しい名前に余計な文字が付くことがある)
      const sure = SUBSKILL_COLORS[color] && any && any.value === m.value;
      return { value: m.value, confidence: m.exact || sure ? 'high' : 'low' };
    }
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
    if (p && p.myth) return { ing: fillMyth(species, ['', '', '']), low: [] };
    if (!p || !clues) return { ing: ['', '', ''], low: [] };
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
    const withA = opts.some((o) => o.g === a);
    if (opts.length > 1) {
      const sameSecond = clues.s32 >= SAME;
      const same = opts.filter((o) => (o.g === second ? sameSecond : o.g === a ? clues.s31 >= SAME : false));
      const rest = opts.filter((o) => o.g !== second && !(o.g === a && clues.s31 !== null));
      if (same.length === 1) opts = same;
      else if (rest.length >= 1 && !sameSecond) opts = rest;
    }
    if (opts.length > 1) low.push(2);
    // 1つ目と同じ絵に見えるのに、1つ目と違う食材になったときは、絵の比較が食い違っているので確認を促す
    else if (withA && opts[0].g !== a && clues.s31 >= SAME) low.push(2);
    return { ing: [a, second, opts[0].g], low };
  }

  // ---------- 銀種(サブスキルのたね) ----------
  // 通常のサブスキルは S → M。同じ名前の M をすでに持っていれば、S は S のまま。
  // 最大所持数アップは、S だけなら M、M だけなら L、S と M の両方なら M が L になり S は S のまま。
  // 決めていない組み合わせ(L を持っている場合など)は変えない
  const CARRY = '最大所持数アップ';
  function applySeed(sub) {
    const has = new Set(sub.filter(Boolean));
    const carryS = has.has(CARRY + 'S'), carryM = has.has(CARRY + 'M'), carryL = has.has(CARRY + 'L');
    return sub.map((name) => {
      if (name === CARRY + 'S') return carryS && !carryM && !carryL ? CARRY + 'M' : name;
      if (name === CARRY + 'M') return carryM && !carryL && !carryS ? CARRY + 'L' : carryS && !carryL ? CARRY + 'L' : name;
      const up = name.endsWith('S') && !name.startsWith(CARRY) ? name.slice(0, -1) + 'M' : '';
      return up && SUBSKILLS.includes(up) && !has.has(up) ? up : name;
    });
  }

  // 銀種の切り替え。row.sub は画面の選択欄の値で、そのまま CSV に出る。
  // 使うときは元の値を row.base に控えて row.sub を変化後にし、外すと row.base に戻す(二重には変換しない)
  function setSeed(row, on) {
    if (on && !row.seed) {
      row.base = row.sub.slice();
      row.sub = applySeed(row.base);
      row.seed = true;
    } else if (!on && row.seed) {
      row.sub = row.base ?? row.sub;
      row.base = null;
      row.seed = false;
    }
  }

  // サブスキルを手で選び直す。銀種を使っていても、選んだ値をそのまま最終の値とする。
  // 元の値にも同じ値を入れるので、あとで銀種を外してもその値が残る
  function editSub(row, i, value) {
    row.sub[i] = value;
    if (row.seed && row.base) row.base[i] = value;
  }

  // ---------- 進化の系統 ----------
  // 進化元 → 進化先は data/evolution.js。その種族が属する系統を、進化の浅い順に並べて返す
  const parentOf = {};
  for (const [from, tos] of Object.entries(EVOLVES_TO)) for (const to of tos) parentOf[to] = from;
  const evolvesTo = (name) => EVOLVES_TO[name] ?? [];

  function line(name) {
    let root = name;
    while (parentOf[root]) root = parentOf[root];
    const out = [], queue = [root];
    while (queue.length) { const n = queue.shift(); out.push(n); queue.push(...evolvesTo(n)); }
    return out.filter((n) => find(n));
  }

  // その種族から進化して行き着く先すべて(自分は含まない)
  function descendants(name) {
    const out = [];
    for (const n of evolvesTo(name)) out.push(n, ...descendants(n));
    return out;
  }

  // 最終進化形。分岐があれば複数になる。進化しない種族は自分自身
  function finals(name) {
    const next = evolvesTo(name).filter((n) => find(n));
    return next.length ? next.flatMap(finals) : [name];
  }


  // ---------- 種族の推定(ニックネームの個体) ----------
  // 詳細画面から分かること(メインスキル名・食材の個数・枠どうしが同じ絵か)で、取りうる種族を絞る。
  // data/skills.js の MAIN_SKILLS(種族 → メインスキル名)を使う。画面には「(ランダム)」が付かないので外して比べる
  const skillKey = (name) => fold(String(name ?? '').replace(/[$¥].*$/, '').replace(/[(（]ランダム[)）]/g, ''));
  const SKILL_KEYS = typeof MAIN_SKILLS === 'undefined' ? [] : [...new Set(Object.values(MAIN_SKILLS).map(skillKey))];

  // 詳細画面に出うる2枠目・3枠目の個数(どれかの種族の表にある値)
  const AMOUNTS2 = new Set(POKEMON.flatMap((p) => (p.amt ? [p.amt[0], p.amt[1]] : [])));
  const AMOUNTS3 = new Set(POKEMON.flatMap((p) => (p.amt ? [p.amt[2], p.amt[3], p.amt[4]] : [])));

  // 読み取ったスキル名を、辞書のスキル名のどれかに直す。決まらなければ ''
  function skillOf(text) {
    const k = skillKey(text);
    if (!k) return '';
    if (SKILL_KEYS.includes(k)) return k;
    // カッコ付きの名前(はどうだん(ゆめのかけらゲットS) など)は、カッコの前の部分が、ちょうど1つのスキルに当たればそれにする。
    // カッコの中の読み違いや、末尾のゴミに左右されない
    const lead = k.split('(')[0];
    if (lead && lead.length >= 3) {
      const byLead = SKILL_KEYS.filter((x) => x.split('(')[0] === lead);
      if (byLead.length === 1) return byLead[0];
    }
    // 括弧の中の読み違いは、前の部分が合えばよいことにする
    const head = SKILL_KEYS.filter((x) => k.startsWith(x) || x.startsWith(k));
    if (head.length === 1) return head[0];
    const m = best(k, SKILL_KEYS, (len) => (len <= 6 ? 0 : 1));
    return m ? m.value : '';
  }

  // 種族の食材の組み合わせごとに、画面に出る値(個数と、枠どうしが同じ絵か)を求める
  function sightings(p) {
    const [a] = p.ing;
    return combos(p.name).map((c) => ({ amt: c.amt, eq21: c.ing[1] === a, eq31: c.ing[2] === a, eq32: c.ing[1] === c.ing[2] }));
  }

  // きのみの絵の色から、きのみのタイプを決める。確かなときだけ返し、少しでも迷うなら '' を返す(外れるくらいなら使わない)。
  // 一番近い見本まで BERRY_NEAR 以内で、2番目の見本より BERRY_GAP 以上近いこと
  const BERRY_NEAR = 16, BERRY_GAP = 20;
  function berryType(feat) {
    if (typeof BERRY_FEAT === 'undefined' || !feat) return '';
    const ranked = Object.entries(BERRY_FEAT).filter(([, v]) => v).map(([t, v]) => [t, Math.hypot(feat[0] - v[0], feat[1] - v[1], feat[2] - v[2])]).sort((a, b) => a[1] - b[1]);
    return ranked.length > 1 && ranked[0][1] <= BERRY_NEAR && ranked[1][1] - ranked[0][1] >= BERRY_GAP ? ranked[0][0] : '';
  }

  // clues は reader の clues({ amount: [2枠目, 3枠目], s21, s31, s32 })。null や不明の値は絞り込みに使わない
  function candidates(skillName, clues) {
    const key = skillOf(skillName);
    const known = (v) => v !== null && v !== undefined;
    const flag = (v) => (known(v) ? v >= SAME : null);
    const eq21 = flag(clues?.s21), eq31 = flag(clues?.s31), eq32 = flag(clues?.s32);
    // どの種族の表にもない個数(「x1」を「14」と読んだ、など)は、読めなかったものとして使わない
    const [r2, r3] = clues?.amount ?? [null, null];
    const n2 = AMOUNTS2.has(r2) ? r2 : null, n3 = AMOUNTS3.has(r3) ? r3 : null;
    const berry = berryType(clues?.berry);
    const found = POKEMON.filter((p) => {
      if (p.myth) return false;
      if (key && skillKey(MAIN_SKILLS[p.name]) !== key) return false;
      return sightings(p).some((s) => (!known(n2) || s.amt[1] === n2) && (!known(n3) || s.amt[2] === n3)
        && (eq21 === null || s.eq21 === eq21) && (eq31 === null || s.eq31 === eq31) && (eq32 === null || s.eq32 === eq32));
    }).map((p) => p.name);
    // きのみのタイプが確かなときだけ絞る。絞って1つも残らなければ、きのみの判定が外れたと見て使わない
    const byBerry = berry ? found.filter((n) => find(n).type === berry) : found;
    return byBerry.length ? byBerry : found;
  }


  // 種族から引いたメインスキル名と、スクショから読んだ名前の突き合わせ。画面に出す内容を決める。
  //   state: 'none' 種族が未選択か辞書にない / 'unknown' その種族のスキルがデータにない / 'mismatch' 読んだ名前と食い違う / 'ok'
  // 読んだ名前(read)が読めていない・辞書にないときは、食い違いとは見なさない
  function skillInfo(species, read = '') {
    const p = find(species);
    if (!p) return { state: 'none', name: '', read: '' };
    const name = typeof MAIN_SKILLS === 'undefined' ? '' : MAIN_SKILLS[p.name] ?? '';
    if (!name) return { state: 'unknown', name: '', read: '' };
    const seen = skillOf(read);
    if (seen && seen !== skillKey(name)) return { state: 'mismatch', name, read: String(read).replace(/[$¥].*$/, '').trim() };
    return { state: 'ok', name, read: '' };
  }

  // 系統(進化のもと)ごとにまとめる
  const rootOf = (name) => { let r = name; while (parentOf[r]) r = parentOf[r]; return r; };

  // 2枠目・3枠目の絵(上下の主な色)が、その種族の食材のどれかの組み合わせにどれだけ合うか。小さいほど合う。色がなければ null。
  // 食材の表(data/ingcolor.js)の、上と下それぞれの主な色の名前が違えば 100、同じなら割合の差(0〜100)を足す。
  // 表にない食材や、名札に隠れて取れない側は数えない
  const COLOR_MISMATCH = 100;
  // ref の5つ目は、縮小した画像などで色の名前が変わる場合の、もう1つの表(同じ並び)
  function colorDist(obs, ref) {
    const one = (r) => {
      let d = 0;
      [[obs.up, r[0], r[2]], [obs.down, r[1], r[3]]].forEach(([o, name, pct]) => {
        if (!name || !o || o.name === 'なし') return;
        d += o.name === name ? (pct === null || pct === undefined ? 0 : Math.abs(o.pct - pct)) : COLOR_MISMATCH;
      });
      return d;
    };
    return ref[4] ? Math.min(one(ref), one(ref[4])) : one(ref);
  }
  function ingredientFit(name, colors) {
    if (typeof INGREDIENT_COLORS === 'undefined' || !colors || !colors[0] || !colors[1]) return null;
    let top = null;
    for (const c of combos(name)) {
      const r2 = INGREDIENT_COLORS[c.ing[1]], r3 = INGREDIENT_COLORS[c.ing[2]];
      if (!r2 || !r3) continue;
      const d = colorDist(colors[0], r2) + colorDist(colors[1], r3);
      if (top === null || d < top) top = d;
    }
    return top;
  }

  // ポケモンの姿の色(Lab)と、色の四角アイコン(data/pokeicons.js の通常色)の比べ合い。小さいほど合う。
  // 姿の各画素から、アイコンのいちばん近い色までの距離の平均 + アイコンの各色から、姿のいちばん近い画素までの距離(下位5%)を面積で重みづけして足したもの。
  // 明るさの差は半分に見る(姿には陰影があるため)
  const lab = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
    const [R, G, B] = [f(r), f(g), f(b)];
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const u = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    return [116 * u(Y) - 16, 500 * (u(X) - u(Y)), 200 * (u(Y) - u(Z))];
  };
  const palettes = {};
  function palette(name, shiny = false) {
    const key = shiny ? `色違い:${name}` : name;
    if (palettes[key] !== undefined) return palettes[key];
    const d = typeof POKE_ICONS === 'undefined' ? null : POKE_ICONS[name];
    if (!d) return (palettes[key] = null);
    const N = 48, grid = new Array(N * N).fill(-1);
    for (const [x, y, w, h, r, c] of d[2]) {
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const px = (i + 0.5) / N, py = (j + 0.5) / N;
        if (px < x || px > x + w || py < y || py > y + h) continue;
        if (r) { const cx = Math.min(Math.max(px, x + r), x + w - r), cy = Math.min(Math.max(py, y + r), y + h - r); if (Math.hypot(px - cx, py - cy) > r) continue; }
        grid[j * N + i] = c;
      }
    }
    const area = d[0].map(() => 0);
    for (const c of grid) if (c >= 0) area[c]++;
    const total = area.reduce((a, b) => a + b, 0);
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return (palettes[key] = total ? d[shiny ? 1 : 0].map((h, i) => ({ lab: lab(rgb(h)), w: area[i] / total })).filter((p) => p.w > 0) : null);
  }
  const dE = (a0, a1, a2, b) => Math.hypot((a0 - b[0]) * 0.5, a1 - b[1], a2 - b[2]);
  // sprite: 姿の画素の Lab を3つずつ並べた配列(reader.js の spriteLab)
  function spriteScore(sprite, name, shiny = false) {
    const pal = palette(name, shiny);
    if (!pal || !sprite || sprite.length < 90) return null;
    const n = sprite.length / 3;
    let a = 0;
    const per = pal.map(() => []);
    for (let i = 0; i < n; i++) {
      let m = Infinity;
      pal.forEach((c, j) => { const e = dE(sprite[3 * i], sprite[3 * i + 1], sprite[3 * i + 2], c.lab); per[j].push(e); if (e < m) m = e; });
      a += m;
    }
    const b = pal.reduce((s, c, j) => { const ds = per[j].sort((x, y) => x - y); return s + c.w * ds[Math.floor(ds.length * 0.05)]; }, 0);
    return a / n + b;
  }

  // 推定の結果。
  //   { kind: 'single', species, options } 系統が1つで最終進化も1つ(自動で入れる)
  //   { kind: 'choose', options, ranked } 選んでもらう。系統が1つで最終進化が複数(イーブイなど)か、複数の系統が残った場合。
  //     複数の系統は、食材の絵が合う順に並べる(ranked が true なら絵で並べた)
  //   { kind: 'none', options: [] } 決められない
  const MAX_OPTIONS = 12;
  // 外す・入れ替える基準(測り直して決める): margin 1位からこれ以上離れた系統を外す / trust 1位の点がこれより大きければ絵の読み取りが外れているので外さない /
  // sprite 姿の色で1位になった系統を先頭に出すのに、2位との差が最低これだけ要る
  const tune = { margin: 40, trust: 60, sprite: 3, shiny: 8 };
  // opts.shiny: 色違いの個体(姿の色が通常色と違うので、姿の色は使わない)
  function guessSpecies(skillName, clues, opts = {}) {
    const names = candidates(skillName, clues);
    if (!names.length) return { kind: 'none', options: [] };
    const roots = [...new Set(names.map(rootOf))];
    if (roots.length === 1) {
      const options = finals(roots[0]);
      return options.length === 1 ? { kind: 'single', species: options[0], options } : { kind: 'choose', options, ranked: false };
    }
    // 複数の系統: 系統ごとに、食材の絵が一番合う種族の点で並べる
    const fit = new Map();
    for (const r of roots) {
      const scores = names.filter((n) => rootOf(n) === r).map((n) => ingredientFit(n, clues?.color)).filter((v) => v !== null);
      fit.set(r, scores.length ? Math.min(...scores) : null);
    }
    const ranked = roots.every((r) => fit.get(r) !== null);
    let order = ranked ? roots.slice().sort((x, y) => fit.get(x) - fit.get(y)) : roots;
    // 絵がはっきり合わない系統は外す。手元の標本で、正解の系統の差は最大でも10。余裕を見て15離れたら外す。
    // 1位の点が大きすぎるときは絵の読み取り自体が外れているので、外さない
    if (ranked && fit.get(order[0]) <= tune.trust) {
      order = order.filter((r) => fit.get(r) <= fit.get(order[0]) + tune.margin); // 1つに絞れても自動では入れない(絵だけで決めるのは危ないので、選んでもらう)
    }
    // ポケモンの姿の色で、先頭の系統を入れ替える。色違いの個体には使わない。2位との差が小さいときは今の並びを残す(並べ替えるだけで、外しも決めもしない)
    // 候補の色違いの色のほうが、通常色よりずっと合うときは、色違いの個体とみなして姿の色を使わない(shinyGuess)
    let colored = false, shinyGuess = false;
    if (!opts.shiny && clues?.sprite && order.length > 1) {
      const pool = [...new Set(order.flatMap((r) => [...names.filter((n) => rootOf(n) === r), ...finals(r)]))];
      const bestOf = (shiny) => Math.min(...pool.map((n) => spriteScore(clues.sprite, n, shiny)).filter((v) => v !== null), Infinity);
      shinyGuess = bestOf(true) + tune.shiny <= bestOf(false);
    }
    if (!opts.shiny && !shinyGuess && clues?.sprite && order.length > 1) {
      const sc = order.map((r) => {
        const own = [...names.filter((n) => rootOf(n) === r), ...finals(r)].map((n) => spriteScore(clues.sprite, n)).filter((v) => v !== null);
        return own.length ? Math.min(...own) : null;
      });
      if (sc.every((v) => v !== null)) {
        const sorted = sc.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
        if (sorted[1][0] - sorted[0][0] >= tune.sprite && sorted[0][1] !== 0) {
          order = [order[sorted[0][1]], ...order.filter((_, i) => i !== sorted[0][1])];
          colored = true;
        }
      }
    }
    const options = order.flatMap((r) => finals(r)).slice(0, MAX_OPTIONS);
    // 絞り込みで1種だけ残ったら、選んでもらわずに入れる(オレンジ枠で確認を促す)
    if (options.length === 1) return { kind: 'single', species: options[0], options, ranked, colored, shinyGuess };
    return { kind: 'choose', options, ranked, colored, shinyGuess };
  }

  // 読み取った文字からスキルレベルを取り出す。1桁で1〜8だけを認める。
  // 「Lv.1」の「v」が「7」と読まれて「71」になることがあるので、最後の1桁だけを使う
  function skillLevelFrom(text) {
    const m = String(text ?? '').match(/(\d)$/);
    const n = m ? Number(m[1]) : null;
    return n >= 1 && n <= 8 ? n : null;
  }

  // ゲームのポケモンの最大レベル(2026年6月の Ver.3.6.0 で 70)。読み取りではこれを超える値を認めない
  const GAME_MAX_LEVEL = 70;
  // 読み取った文字からポケモンのレベルを取り出す。数字だけの1〜2桁で、1〜GAME_MAX_LEVEL だけを認める
  function levelFrom(text) {
    const m = String(text ?? '').match(/^x?(\d{1,2})$/);
    const n = m ? Number(m[1]) : null;
    return n >= 1 && n <= GAME_MAX_LEVEL ? n : null;
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
    if (row.pending) errors.push(`進化先を選んでください(${finals(row.shown).join('、')})`);
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
    // 性格が空のまま取り込むと、個体値計算機が黙って「てれや」にするので、出力させない
    if (!row.nature) errors.push('性格を選んでください(空のままだと、取り込み先で「てれや」になってしまいます)');
    // ミュウ・ダークライは、ひらめきの種で解放するまで食材2・3が「なし」でよい。空は正しい値なので、注意も出さない
    if (!find(row.species)?.myth) {
      if (row.level >= 30 && !row.ing[1]) warnings.push('食材2が空です');
      if (row.level >= 60 && !row.ing[2]) warnings.push('食材3が空です');
    }
    return { errors, warnings };
  }

  return { tune, lab, colorDist, spriteScore, berryType, ingredientFit, skillInfo, skillOf, sightings, candidates, guessSpecies, rootOf, fold, distance, best, species, nature, subskill, ingredients, combos, skillLevelFrom, levelFrom, GAME_MAX_LEVEL, applySeed, setSeed, editSub, line, descendants, finals, ingredientsOf, search, checkRow, fillMyth, find };
})();

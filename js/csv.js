// 個体値計算機(nitoyon 氏)のボックスへ取り込める CSV を作る。列の並びと見出しは、個体値計算機を日本語表示にしたときのエクスポートと同じ
// (18列。メインスキルは種族から、お気に入りは持っていないので空欄)。値の書き方: ミント・色違いは 1/0、一緒に眠った時間は 0/200/500/1000/2000(時間)
'use strict';

const Csv = (() => {
  const HEADER = ['ニックネーム', 'ポケモン', 'レベル', 'スキルレベル', '食材1', '食材2', '食材3', 'メインスキル', 'せいかく', 'まっしろミント', 'Lv10', 'Lv25', 'Lv50', 'Lv70', 'Lv80', '一緒に眠った時間', '色違い', 'お気に入り'];
  // 1つ前の版までの見出し(読み込みでは今も受け付ける)
  const OLD_HEADER = ['nickname', 'Pokemon', 'level', 'skill level', 'ing 1', 'ing 2', 'ing 3', 'nature', 'Lv10', 'Lv25', 'Lv50', 'Lv70', 'Lv80', 'shiny', 'mint', 'ribbon'];

  function escape(value) {
    // 取り込み側は1行ずつ読むので、改行は値の中に残さない
    const s = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  // 個体値計算機の種族名は、姿違いを「ピカチュウ (キャプテン)」と空白を入れて書く
  const speciesOut = (name) => String(name ?? '').replace(/\(/, ' (');
  // メインスキル: 種族のスキル名。ミュウ(オールマイティー)は個体ごとに選ぶ形なので空欄にする(空欄なら個体値計算機が自分で決める)
  const mainSkillOf = (species) => {
    const p = typeof POKEMON !== 'undefined' ? POKEMON.find((x) => x.name === species) : null;
    if (p && p.versatile) return '';
    return (typeof MAIN_SKILLS !== 'undefined' && MAIN_SKILLS[species]) || '';
  };

  function line(row) {
    return [
      row.nickname, speciesOut(row.species), row.level, row.skillLevel ?? '',
      row.ing[0], row.ing[1], row.ing[2], mainSkillOf(row.species), row.nature,
      row.mint ? 1 : 0,
      ...row.sub,
      row.ribbon ?? 0,
      row.shiny ? 1 : 0,
      '',
    ].map(escape).join(',');
  }

  const build = (rows) => [HEADER.join(','), ...rows.map(line)].join('\n') + '\n';

  return { HEADER, OLD_HEADER, escape, build };
})();

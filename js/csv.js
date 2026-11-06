// 個体値計算機のボックスへ取り込める CSV を作る。ヘッダーは言語設定によらず通る英語名
'use strict';

const Csv = (() => {
  const HEADER = ['nickname', 'Pokemon', 'level', 'skill level', 'ing 1', 'ing 2', 'ing 3', 'nature', 'Lv10', 'Lv25', 'Lv50', 'Lv70', 'Lv80', 'shiny'];

  function escape(value) {
    // 取り込み側は1行ずつ読むので、改行は値の中に残さない
    const s = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function line(row) {
    return [
      row.nickname, row.species, row.level, row.skillLevel ?? '',
      row.ing[0], row.ing[1], row.ing[2], row.nature,
      ...Match.effectiveSub(row),
      row.shiny ? 1 : 0,
    ].map(escape).join(',');
  }

  const build = (rows) => [HEADER.join(','), ...rows.map(line)].join('\n') + '\n';

  return { HEADER, escape, build };
})();

// 種族ごとのメインスキル名 data/skills.js を作る。
//   node tools/build_skills.js <pokemon.json> <ja/skills.json> <取得元のコミットID>
// 出どころは nitoyon/pokesleep-tool の src/data/pokemon.json(種族 → メインスキルの英語名)と、
// src/i18n/ja/skills.json(英語名 → 日本語名)。MIT License、Copyright (c) 2023-2026 nitoyon。全文は THIRD-PARTY-LICENSES.txt。
// 種族名は data/pokemon.js の名前に直して写す。スキルが「unknown」の個体は入れない。
'use strict';
const fs = require('fs');
const path = require('path');

const [, , srcPokemon, srcSkills, commit] = process.argv;
if (!srcPokemon || !srcSkills || !commit) { console.error('使い方: node tools/build_skills.js <pokemon.json> <ja/skills.json> <コミットID>'); process.exit(1); }
const root = path.join(__dirname, '..');

const upstream = JSON.parse(fs.readFileSync(srcPokemon, 'utf8'));
const ja = JSON.parse(fs.readFileSync(srcSkills, 'utf8')).skills;
const POKEMON = new Function(`${fs.readFileSync(path.join(root, 'data/pokemon.js'), 'utf8')}; return POKEMON;`)();

// 図鑑番号だけでは決まらない姿 → 上流の [id, form]
const FORM = {
  'ピカチュウ(ハロウィン)': [25, 'Halloween'], 'ピカチュウ(ホリデー)': [25, 'Holiday'], 'ピカチュウ(キャプテン)': [25, 'Captain'],
  'イーブイ(ホリデー)': [133, 'Holiday'], 'イーブイ(ハロウィン)': [133, 'Halloween'], 'タマザラシ(ホリデー)': [363, 'Holiday'],
  'ロコン(アローラ)': [37, 'Alola'], 'キュウコン(アローラ)': [38, 'Alola'], 'ウパー(パルデア)': [194, 'Paldea'],
  'バケッチャ(こだましゅ)': [710, 'Small'], 'バケッチャ(ちゅうだましゅ)': [710, 'Medium'], 'バケッチャ(おおだましゅ)': [710, 'Large'], 'バケッチャ(ギガだましゅ)': [710, 'Jumbo'],
  'パンプジン(こだましゅ)': [711, 'Small'], 'パンプジン(ちゅうだましゅ)': [711, 'Medium'], 'パンプジン(おおだましゅ)': [711, 'Large'], 'パンプジン(ギガだましゅ)': [711, 'Jumbo'],
  'ストリンダー(ハイ)': [849, 'Amped'], 'ストリンダー(ロー)': [849, 'Low Key'],
};

const out = {}, skipped = [];
for (const p of POKEMON) {
  const [id, form] = FORM[p.name] ?? [p.no, undefined];
  let u = upstream.find((x) => x.id === id && x.form === form);
  if (!u && form === undefined) { const same = upstream.filter((x) => x.id === id); if (same.length === 1) u = same[0]; } // 姿違いしか上流にない種族(ドオーなど)
  if (!u) { console.error('上流に見つからない種族:', p.name); process.exit(1); }
  const j = ja[u.skill];
  if (!j || u.skill === 'unknown') { skipped.push(p.name); continue; }
  out[p.name] = j.name;
}

const header = `// tools/build_skills.js の生成物。手で直さない。
// 種族ごとのメインスキル名。nitoyon/pokesleep-tool の src/data/pokemon.json と src/i18n/ja/skills.json を写したもの(MIT License, Copyright (c) 2023-2026 nitoyon)。ライセンス全文: THIRD-PARTY-LICENSES.txt
// 取得元のコミット: https://github.com/nitoyon/pokesleep-tool/tree/${commit}
// スキルが不明な個体は入れていない: ${skipped.join('、') || 'なし'}
'use strict';

// 種族名 -> メインスキル名(姿違いのスキルは「ばけのかわ (きのみバースト)」のように括弧で付く)
const MAIN_SKILLS = `;
fs.writeFileSync(path.join(root, 'data/skills.js'), `${header}${JSON.stringify(out)};\n`);
console.log(`${Object.keys(out).length}種族を書き出しました。不明: ${skipped.join('、') || 'なし'}`);

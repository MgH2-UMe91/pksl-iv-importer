// BOX の箱に出す「色の四角アイコン」のデータ data/pokeicons.js を作る。
//   node tools/build_pokeicons.js <PokemonIconData.ts のパス>
// 出どころは nitoyon/pokesleep-tool の src/ui/IvCalc/PokemonIconData.ts(MIT License、Copyright (c) 2023-2026 nitoyon)。
// 全文は THIRD-PARTY-LICENSES.txt。ゲームの絵は使わない。色の四角の座標と色だけを、種族名 → 形に直して写す。
'use strict';
const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) { console.error('PokemonIconData.ts のパスを渡してください'); process.exit(1); }
const root = path.join(__dirname, '..');

let ts = fs.readFileSync(src, 'utf8');
ts = ts.replace(/interface \w+ \{[\s\S]*?\r?\n\}\r?\n/g, '')
  .replace('const pokemonRectData: { [id: string]: IconData } =', 'globalThis.__ICONS =')
  .replace('export default pokemonRectData;', '');
// eslint-disable-next-line no-eval
(0, eval)(ts);
const ICONS = globalThis.__ICONS;

// data/pokemon.js の POKEMON(const なので、関数で包んで取り出す)
const POKEMON = new Function(`${fs.readFileSync(path.join(root, 'data/pokemon.js'), 'utf8')}; return POKEMON;`)();

// 図鑑番号だけでは決まらない姿(バケッチャ・パンプジン・ストリンダー)は、上流の idForm で引く
const FORM_KEY = {
  'バケッチャ(こだましゅ)': 29382, 'バケッチャ(ちゅうだましゅ)': 33478, 'バケッチャ(おおだましゅ)': 37574, 'バケッチャ(ギガだましゅ)': 41670,
  'パンプジン(こだましゅ)': 29383, 'パンプジン(ちゅうだましゅ)': 33479, 'パンプジン(おおだましゅ)': 37575, 'パンプジン(ギガだましゅ)': 41671,
  'ストリンダー(ハイ)': 21329, 'ストリンダー(ロー)': 25425,
  // 図鑑番号だけで引くと、通常の姿のアイコンになってしまう姿(上流の idForm = 図鑑番号 + 4096 × 姿の番号)。上流の16578は、コメントが「Quagsire (Paldea)」だが、図鑑番号194なのでパルデアのウパー
  'ピカチュウ(ハロウィン)': 4121, 'ピカチュウ(ホリデー)': 8217, 'ピカチュウ(キャプテン)': 45081,
  'イーブイ(ハロウィン)': 4229, 'イーブイ(ホリデー)': 8325, 'ロコン(アローラ)': 12325, 'キュウコン(アローラ)': 12326,
  'ウパー(パルデア)': 16578, 'タマザラシ(ホリデー)': 8555,
};

const r1 = (v) => Math.round(v * 1000) / 1000;
const out = {};
const missing = [];
for (const p of POKEMON) {
  const d = ICONS[FORM_KEY[p.name] ?? p.no];
  if (!d) { missing.push(p.name); continue; }
  // [通常色の並び, 色違いの並び, 四角たち[x, y, w, h, 角の丸み(0なら直角), 色の番号]] (座標は 0〜1 の比)
  out[p.name] = [d.normalPallet, d.shinyPallet, d.rects.map((r) => [r1(r.x), r1(r.y), r1(r.w), r1(r.h), r.r === undefined ? 0 : r1(r.r), r.color])];
}
if (missing.length) { console.error('アイコンがない種族:', missing.join(', ')); process.exit(1); }

const header = `// tools/build_pokeicons.js の生成物。手で直さない。
// 色の四角アイコンのデータは nitoyon/pokesleep-tool の PokemonIconData.ts を写したもの(MIT License, Copyright (c) 2023-2026 nitoyon)。ライセンス全文: THIRD-PARTY-LICENSES.txt
'use strict';

// 種族名 -> [通常色, 色違いの色, 四角たち[x, y, w, h, 丸み, 色の番号]]
const POKE_ICONS = `;
fs.writeFileSync(path.join(root, 'data/pokeicons.js'), `${header}${JSON.stringify(out)};\n`);
console.log(`${Object.keys(out).length}種族を書き出しました`);

// ブラウザで tests/index.html を開くと動く(ビルドなし)
'use strict';

const results = [];
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  results.push({ name, ok: a === e, detail: a === e ? '' : `\n    実際 ${a}\n    期待 ${e}` });
}
const row = (o) => ({ nickname: '', species: 'フシギダネ', level: 60, ing: ['あまいミツ', 'あんみんトマト', 'ほっこりポテト'], nature: 'ようき', sub: ['', '', '', '', ''], shiny: false, ...o });

// 辞書
eq('種族名に重複がない', new Set(POKEMON.map((p) => p.name)).size, POKEMON.length);
eq('性格は25種', NATURES.length, 25);
eq('食材は20種', INGREDIENTS.length, 20);
eq('食材はすべて辞書にある', POKEMON.flatMap((p) => p.myth ?? p.ing).filter((g) => !INGREDIENTS.includes(g)), []);
for (const [n, list] of Object.entries({ NATURES, SUBSKILLS, INGREDIENTS })) {
  eq(`${n} は文字をそろえても区別できる`, new Set(list.map(Match.fold)).size, list.length);
}
eq('種族名は文字をそろえても区別できる', new Set(POKEMON.map((p) => Match.fold(p.name))).size, POKEMON.length);

// 種族とニックネームの判定
eq('全種族が自分自身に一致する', POKEMON.filter((p) => { const r = Match.species(p.name); return r.species !== p.name || r.confidence !== 'high'; }).map((p) => p.name), []);
eq('完全一致', Match.species('ピカチュウ').species, 'ピカチュウ');
eq('へとヘの取り違え', Match.species('へラクロス').species, 'ヘラクロス');
eq('長音の誤読', Match.species('カイリュ一').species, 'カイリュー');
eq('力とカの取り違え', Match.species('力イリュー').species, 'カイリュー');
eq('1字の誤字は近似一致', Match.species('フシギバテ'), { species: 'フシギバナ', nickname: '', confidence: 'low', candidates: [] });
eq('ニックネームは名前欄に残る', Match.species('たろう'), { species: '', nickname: 'たろう', confidence: 'none', candidates: [] });
eq('短いニックネームは近似で拾わない', Match.species('ピカ').species, '');
eq('空', Match.species('  ').nickname, '');
eq('姿違いの種族名は候補を出す', Match.species('バケッチャ').candidates.length, 4);
eq('姿違いの種族名はニックネームにしない', Match.species('バケッチャ').nickname, '');
eq('姿のない名前がある種族はそのまま', Match.species('ピカチュウ').candidates, []);

// 性格・サブスキル・食材
eq('性格の完全一致', Match.nature('いじっぱり'), { value: 'いじっぱり', confidence: 'high' });
eq('性格の誤字', Match.nature('いじっぱリ').value, 'いじっぱり');
eq('性格の1字余り', Match.nature('さみしがリや').value, 'さみしがり');
eq('関係ない文字は性格にしない', Match.nature('ポケモン').value, '');
eq('サブスキルの完全一致', Match.subskill('おてつだいスピードM').value, 'おてつだいスピードM');
eq('全角の英字', Match.subskill('食材確率アップS').value, '食材確率アップS');
eq('末尾の欠けはS/Mを決めない', Match.subskill('食材確率アップ').value, '');
eq('末尾の欠けは色でS/Mを決める', Match.subskill('食材確率アップ', 'blue').value, '食材確率アップM');
eq('SとMの読み違いは色で直す', Match.subskill('おてつだいスピードS', 'blue').value, 'おてつだいスピードM');
eq('サブスキルの色分けは全種を含む', Object.values(SUBSKILL_COLORS).flat().sort(), [...SUBSKILLS].sort());

// 食材の判定(ムウマは a=ポテト b=コーヒー c=トマトで、個数は [2,2,4,3,4])
const clue = (amount, s21, s31, s32) => ({ amount, s21, s31, s32 });
eq('個数で決まる', Match.ingredients('タマゲタケ', clue([7, 11], 0, 0, 0)).ing, ['あじわいキノコ', 'とくせんエッグ', 'あんみんトマト']);
eq('2番目が同数なら絵で a', Match.ingredients('ムウマ', clue([2, 3], 0.97, 0.5, 0.5)).ing[1], 'ほっこりポテト');
eq('2番目が同数なら絵で b', Match.ingredients('ムウマ', clue([2, 3], 0.5, 0.5, 0.97)).ing[1], 'めざましコーヒー');
eq('3番目が同数で a と違う絵なら c', Match.ingredients('ムウマ', clue([2, 4], 0.97, 0.5, 0.5)).ing[2], 'あんみんトマト');
eq('3番目が同数で a と同じ絵なら a', Match.ingredients('ムウマ', clue([2, 4], 0.5, 0.97, 0.5)).ing[2], 'ほっこりポテト');
eq('幻のポケモンは空', Match.ingredients('ミュウ', clue([2, 4], 0, 0, 0)).ing, ['', '', '']);
eq('種族が未定なら空', Match.ingredients('', clue([2, 4], 0, 0, 0)).ing, ['', '', '']);

// 食材の組み合わせ
eq('3種の種族は6通り', Match.combos('タマゲタケ').length, 6);
eq('2種の種族は4通り', Match.combos('カラカラ').length, 4);
eq('幻のポケモンは枠ごとに選ぶ', Match.combos('ミュウ'), []);
eq('個数は画面と同じ', Match.combos('タマゲタケ')[5], { ing: ['あじわいキノコ', 'とくせんエッグ', 'あんみんトマト'], amt: [2, 7, 11] });
eq('食材以外が得意な種族は最初1個', Match.combos('ムウマ')[0].amt, [1, 2, 4]);
eq('全食材にアイコンがある', INGREDIENTS.filter((g) => !INGREDIENT_ICONS[g]), []);
eq('組み合わせはすべて検査を通る', POKEMON.filter((p) => !p.myth).flatMap((p) => Match.combos(p.name).flatMap((c) => Match.checkRow(row({ species: p.name, ing: c.ing })).errors)), []);

// 検索
eq('ひらがなで検索', Match.search('ぴかちゅう')[0], 'ピカチュウ');
eq('途中の文字で検索', Match.search('チュウ').includes('ライチュウ'), true);

// 行の検査
eq('正常な行', Match.checkRow(row()), { errors: [], warnings: [] });
eq('種族が未選択なら止める', Match.checkRow(row({ species: '', nickname: 'たろう' })).errors, ['ポケモンを選んでください']);
eq('種族に合わない食材は止める', Match.checkRow(row({ ing: ['あまいミツ', 'マメミート', ''] })).errors, ['食材2「マメミート」はフシギダネの食材ではありません']);
eq('食材2に3番目の食材は入らない', Match.checkRow(row({ ing: ['あまいミツ', 'ほっこりポテト', ''] })).errors.length, 1);
eq('辞書にない性格は止める', Match.checkRow(row({ nature: 'ふしぎ' })).errors.length, 1);
eq('辞書にないサブスキルは止める', Match.checkRow(row({ sub: ['ねむけ', '', '', '', ''] })).errors.length, 1);
eq('レベルなしは止める', Match.checkRow(row({ level: NaN })).errors.length, 1);
eq('空の食材は注意だけ', Match.checkRow(row({ ing: ['あまいミツ', '', ''] })), { errors: [], warnings: ['食材2が空です', '食材3が空です'] });

eq('スキルレベルは空でもよい', Match.checkRow(row({ skillLevel: '' })).errors, []);
eq('範囲外のスキルレベルは止める', Match.checkRow(row({ skillLevel: 9 })).errors.length, 1);
eq('スキルレベルはCSVに入る', Csv.build([row({ skillLevel: 6 })]).split(/\n/)[1].split(',')[3], '6');

// CSV
eq('ヘッダーと1行', Csv.build([row({ sub: ['おてつだいボーナス', '', '', '', ''], shiny: true })]),
  'nickname,Pokemon,level,skill level,ing 1,ing 2,ing 3,nature,Lv10,Lv25,Lv50,Lv70,Lv80,shiny\n,フシギダネ,60,,あまいミツ,あんみんトマト,ほっこりポテト,ようき,おてつだいボーナス,,,,,1\n');
eq('カンマ入りの名前', Csv.escape('a,b'), '"a,b"');
eq('引用符入りの名前', Csv.escape('a"b'), '"a""b"');
eq('改行は空白に', Csv.escape('a\nb'), 'a b');
eq('普通の名前はそのまま', Csv.escape('たろう'), 'たろう');

// 銀種
const C = '最大所持数アップ';
const seed = (...s) => Match.applySeed([...s, '', '', '', '', ''].slice(0, 5)).filter(Boolean);
eq('〇〇S のみ → 〇〇M', seed('スキル確率アップS'), ['スキル確率アップM']);
eq('〇〇S と 〇〇M → 変化なし', seed('スキル確率アップS', 'スキル確率アップM'), ['スキル確率アップS', 'スキル確率アップM']);
eq('最大所持数S のみ → M', seed(C + 'S'), [C + 'M']);
eq('最大所持数M のみ → L', seed(C + 'M'), [C + 'L']);
eq('最大所持数S と M → S と L', seed(C + 'S', C + 'M'), [C + 'S', C + 'L']);
eq('最大所持数L のみ → 変化なし', seed(C + 'L'), [C + 'L']);
eq('最大所持数S と L → 変化なし', seed(C + 'S', C + 'L'), [C + 'S', C + 'L']);
eq('最大所持数M と L → 変化なし', seed(C + 'M', C + 'L'), [C + 'M', C + 'L']);
eq('最大所持数S と M と L → 変化なし', seed(C + 'S', C + 'M', C + 'L'), [C + 'S', C + 'M', C + 'L']);
eq('Mのない〇〇S は変化なし', seed('きのみの数S'), ['きのみの数S']);
eq('金のサブスキル(M なし)は変化なし', seed('おてつだいボーナス', 'ゆめのかけらボーナス'), ['おてつだいボーナス', 'ゆめのかけらボーナス']);
eq('空の枠は空のまま', Match.applySeed(['', '', '', '', '']), ['', '', '', '', '']);
eq('位置は変わらない', Match.applySeed(['スキル確率アップS', '', 'おてつだいスピードS', '', C + 'M']), ['スキル確率アップM', '', 'おてつだいスピードM', '', C + 'L']);
eq('実際の並び', Match.applySeed(['スキル確率アップS', 'おてつだいスピードM', C + 'M', '食材確率アップS', 'おてつだいボーナス']),
  ['スキル確率アップM', 'おてつだいスピードM', C + 'L', '食材確率アップM', 'おてつだいボーナス']);
eq('銀種を使うと CSV は変化後', Csv.build([row({ seed: true, sub: ['スキル確率アップS', '', '', '', ''] })]).split(/\r?\n/)[1].split(',').slice(8, 13), ['スキル確率アップM', '', '', '', '']);
eq('銀種を使わなければ CSV はそのまま', Csv.build([row({ seed: false, sub: ['スキル確率アップS', '', '', '', ''] })]).split(/\r?\n/)[1].split(',').slice(8, 13), ['スキル確率アップS', '', '', '', '']);

// 進化の系統
const inLines = POKEMON.map((p) => p.name).filter((n) => Match.line(n).includes(n));
eq('全種族がどれかの系統に入る', inLines.length, POKEMON.length);
eq('進化の登録は辞書にある種族だけ', Object.entries(EVOLVES_TO).flatMap(([a, b]) => [a, ...b]).filter((n) => !Match.find(n)), []);
eq('系統は1つの根から広がる(進化元が2つの種族がない)',
  Object.values(EVOLVES_TO).flat().filter((n, i, all) => all.indexOf(n) !== i), []);
eq('フシギダネの系統', Match.line('フシギバナ'), ['フシギダネ', 'フシギソウ', 'フシギバナ']);
eq('ピカチュウの系統は進化前を含む', Match.line('ピカチュウ'), ['ピチュー', 'ピカチュウ', 'ライチュウ']);
eq('イベントのピカチュウは進化しない', Match.line('ピカチュウ(ホリデー)'), ['ピカチュウ(ホリデー)']);
eq('分岐の系統(ヤドン)', Match.line('ヤドン'), ['ヤドン', 'ヤドラン', 'ヤドキング']);
eq('イーブイは9種の系統', Match.line('イーブイ').length, 9);
eq('一本道の最終進化形', Match.finals('フシギダネ'), ['フシギバナ']);
eq('途中からの最終進化形', Match.finals('フシギソウ'), ['フシギバナ']);
eq('最終進化形は自分自身', Match.finals('フシギバナ'), ['フシギバナ']);
eq('分岐は複数の最終進化形(ヤドン)', Match.finals('ヤドン'), ['ヤドラン', 'ヤドキング']);
eq('分岐は複数の最終進化形(キルリア)', Match.finals('キルリア'), ['サーナイト', 'エルレイド']);
eq('ラルトスの最終進化形は2つ', Match.finals('ラルトス'), ['サーナイト', 'エルレイド']);
eq('ウパーの2つの姿は別の系統', [Match.finals('ウパー'), Match.finals('ウパー(パルデア)')], [['ヌオー'], ['ドオー']]);
eq('進化しない種族', Match.finals('ミュウ'), ['ミュウ']);
eq('子孫(フシギダネ)', Match.descendants('フシギダネ'), ['フシギソウ', 'フシギバナ']);

// スキルレベルの読み取り
eq('「71」は最後の1桁を使う', Match.skillLevelFrom('71'), 1);
eq('1桁はそのまま', Match.skillLevelFrom('6'), 6);
eq('9は範囲外', Match.skillLevelFrom('9'), null);
eq('0は範囲外', Match.skillLevelFrom('0'), null);
eq('読めなければ null', Match.skillLevelFrom(''), null);
eq('スキルレベル71は出力を止める', Match.checkRow(row({ skillLevel: 71 })).errors.length, 1);
eq('スキルレベル0は出力を止める', Match.checkRow(row({ skillLevel: 0 })).errors.length, 1);
eq('スキルレベル8は通る', Match.checkRow(row({ skillLevel: 8 })).errors.length, 0);

const failed = results.filter((r) => !r.ok);
document.getElementById('out').textContent =
  `${results.length}件中 ${results.length - failed.length}件成功\n` +
  failed.map((r) => `NG ${r.name}${r.detail}`).join('\n');
window.testResult = { total: results.length, failed: failed.map((r) => r.name) };

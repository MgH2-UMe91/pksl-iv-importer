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
// カメックスは a=ミルク b=カカオ c=ミートで、個数は [5,3,7,5,7]。1つ目が名札に隠れて下の端だけ見える画面
eq('2番目と3番目が同じ絵なら、3番目も2番目と同じ(カメックス)', Match.ingredients('カメックス', clue([5, 7], 0.88, 0.99, 0.999)), { ing: ['モーモーミルク', 'モーモーミルク', 'モーモーミルク'], low: [] });
eq('絵の比較が食い違えば印を付ける(1つ目と同じ絵なのに別の食材)', Match.ingredients('カメックス', clue([5, 7], 0.88, 0.99, 0.90)), { ing: ['モーモーミルク', 'モーモーミルク', 'マメミート'], low: [2] });
eq('1つ目が隠れて比べられず、3番目がミルクかミートか決まらなければ印を付ける', Match.ingredients('カメックス', clue([3, 7], null, null, 0.5)).low, [2]);
eq('1つ目が隠れていても、2番目と違う絵なら残りの1つに決まる', Match.ingredients('カメックス', clue([5, 7], null, null, 0.5)), { ing: ['モーモーミルク', 'モーモーミルク', 'マメミート'], low: [] });
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
  'nickname,Pokemon,level,skill level,ing 1,ing 2,ing 3,nature,Lv10,Lv25,Lv50,Lv70,Lv80,shiny,mint,ribbon\n,フシギダネ,60,,あまいミツ,あんみんトマト,ほっこりポテト,ようき,おてつだいボーナス,,,,,1,0,0\n');
eq('ミントと眠った時間はCSVの mint と ribbon に入る', Csv.build([row({ mint: true, ribbon: 1000 })]).split(/\n/)[1].split(',').slice(14), ['1', '1000']);
eq('指定がなければ mint 0 と ribbon 0', Csv.build([row({})]).split(/\n/)[1].split(',').slice(14), ['0', '0']);
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
eq('金のサブスキルは7つ', [...SUBSKILL_COLORS.gold].sort(), ['きのみの数S', 'ゆめのかけらボーナス', 'げんき回復ボーナス', 'おてつだいボーナス', 'リサーチEXPボーナス', '睡眠EXPボーナス', 'スキルレベルアップM'].sort());
eq('青のサブスキルは6つ', [...SUBSKILL_COLORS.blue].sort(), ['スキルレベルアップS', 'スキル確率アップM', 'おてつだいスピードM', '食材確率アップM', '最大所持数アップM', '最大所持数アップL'].sort());
eq('銀種で青になる(最大所持数アップS→M)', SUBSKILL_COLORS.blue.includes(Match.applySeed(['最大所持数アップS', '', '', '', ''])[0]), true);
eq('青と金は重ならない', SUBSKILL_COLORS.blue.filter((x) => SUBSKILL_COLORS.gold.includes(x)), []);
eq('銀種で金になる(スキルレベルアップS→M)', SUBSKILL_COLORS.gold.includes(Match.applySeed(['スキルレベルアップS', '', '', '', ''])[0]), true);
eq('サブスキルは完全一致なら自信が高い', Match.subskill('おてつだいスピードS', 'white'), { value: 'おてつだいスピードS', confidence: 'high' });
eq('余計な文字が付いても、色の中で1つに絞れれば自信は高い', Match.subskill('おてつだいスピードS$S', 'white'), { value: 'おてつだいスピードS', confidence: 'high' });
eq('金の「ボーナス」の誤読も、色の中で1つに絞れれば自信は高い', Match.subskill('おてつだいボポーナス', 'gold'), { value: 'おてつだいボーナス', confidence: 'high' });
eq('色が決まらないときは誤読に印を付ける', Match.subskill('おてつだいボポーナス', undefined).confidence, 'low');
eq('色の中の候補と色を問わない候補が食い違うときは印を付ける(色の誤検出に備える)', Match.subskill('スキルレベルアップS', 'white').confidence, 'low');
eq('色の中の近い候補は、取り違えやすい S と M でも色で決まる', Match.subskill('おてつだいスピードM', 'white').value, 'おてつだいスピードS');
eq('読めなければ空', Match.subskill('', 'white').value, '');
const csvSub = (r) => Csv.build([r]).split(/\r?\n/)[1].split(',').slice(8, 13);
const S5 = ['スキル確率アップS', 'おてつだいスピードS', C + 'S', '', ''];
const S5on = ['スキル確率アップM', 'おてつだいスピードM', C + 'M', '', ''];
const mk = () => row({ seed: false, base: null, sub: [...S5] });
let r1 = mk();
eq('銀種を使わなければ CSV はそのまま', csvSub(r1), S5);
Match.setSeed(r1, true);
eq('銀種を入れると選択欄の値が変化後になる', r1.sub, S5on);
eq('銀種を入れた CSV は選択欄と同じ(二重に変換しない)', csvSub(r1), S5on);
Match.setSeed(r1, true);
eq('もう一度入れても変わらない', r1.sub, S5on);
Match.setSeed(r1, false);
eq('銀種を外すと元の値に戻る', r1.sub, S5);
eq('外したあとの CSV も元の値', csvSub(r1), S5);
Match.setSeed(r1, false);
eq('外した状態で外しても変わらない', r1.sub, S5);
r1 = mk(); Match.setSeed(r1, true); Match.setSeed(r1, false); Match.setSeed(r1, true);
eq('入れて外してまた入れても、二重に変換しない', r1.sub, S5on);
r1 = mk(); Match.setSeed(r1, true); Match.editSub(r1, 0, 'スキル確率アップS');
eq('銀種中に手で選び直すと、その値が表示と CSV になる', csvSub(r1), ['スキル確率アップS', 'おてつだいスピードM', C + 'M', '', '']);
Match.setSeed(r1, false);
eq('手で選んだ値は銀種を外しても残り、ほかは元に戻る', r1.sub, S5);
r1 = mk(); Match.setSeed(r1, true); Match.editSub(r1, 1, '食材確率アップM');
Match.setSeed(r1, false);
eq('手で別の値にしたものは、銀種を外してもその値のまま', r1.sub, ['スキル確率アップS', '食材確率アップM', C + 'S', '', '']);
r1 = mk(); Match.editSub(r1, 0, '食材確率アップS');
eq('銀種を使わない手の選び直しは元の値になる', r1.sub[0], '食材確率アップS');
const noChange = row({ seed: false, base: null, sub: ['きのみの数S', 'おてつだいボーナス', '', '', ''] });
Match.setSeed(noChange, true);
eq('変化しないサブスキルはそのまま', noChange.sub, ['きのみの数S', 'おてつだいボーナス', '', '', '']);

// BOX
eq('名前は全角10文字まで', Box.cleanName('あいうえおかきくけこさし'), 'あいうえおかきくけこ');
eq('名前の前後の空白は消す', Box.cleanName('  ぼっくす  '), 'ぼっくす');
eq('名前が空なら既定の名前に戻る', Box.nameOf({ name: Box.cleanName('   ') }, 2), 'BOX2');
eq('付けた名前を使う', Box.nameOf({ name: '本命' }, 1), '本命');
eq('ファイル名に使えない記号は _ にする', Box.fileName('a/b:c*d?e"f<g>h|i' + String.fromCharCode(92) + 'j'), 'a_b_c_d_e_f_g_h_i_j.csv');
eq('普通の名前はそのままファイル名にする', Box.fileName('本命BOX'), '本命BOX.csv');
eq('250匹入っているBOXに70匹は入らない', Box.plan(70, [250, 0]), [{ fits: false, room: 50 }, { fits: true, room: 300 }]);
eq('ちょうど300匹になるなら入る', Box.plan(50, [250, 300]), [{ fits: true, room: 50 }, { fits: false, room: 0 }]);
eq('両方に入らないこともある', Box.plan(100, [250, 280]).map((x) => x.fits), [false, false]);
eq('上書きなら元の中身を数えない(300匹のBOXに300匹)', Box.plan(300, [300, 10], 1).map((x) => x.fits), [true, false]);
eq('上書きでも300匹を超えたら入らない', Box.plan(301, [10, 10], 1).map((x) => x.fits), [false, false]);
{
  const r = row({ nickname: 'たろう', skillLevel: 6, shiny: true, mint: true, ribbon: 500, sub: ['おてつだいボーナス', 'きのみの数S', '', '', ''] });
  const back = Box.unpack(JSON.parse(JSON.stringify(Box.pack(r))));
  eq('保存して戻しても同じ内容', back, { nickname: 'たろう', species: r.species, level: r.level, skillLevel: 6, ing: r.ing, nature: r.nature, sub: r.sub, shiny: true, mint: true, ribbon: 500, seed: false, base: null });
  const seeded = Box.unpack(JSON.parse(JSON.stringify(Box.pack(row({ seed: true, base: ['スキルレベルアップS', '', '', '', ''], sub: ['スキルレベルアップM', '', '', '', ''] })))));
  eq('銀種を使った後のサブスキルをそのまま保存し、銀種の印は残さない', [seeded.seed, seeded.base, seeded.sub[0]], [false, null, 'スキルレベルアップM']);
  eq('保存する中身に銀種の欄はない', Box.pack(row({ seed: true, base: ['スキルレベルアップS', '', '', '', ''] })).length, 10);
  eq('戻したあとに銀種を使うと、保存したサブスキルがさらに一段上がる(最大所持数アップM→L)', Match.applySeed(['最大所持数アップM', '', '', '', ''])[0], '最大所持数アップL');
  const three = [Box.pack(row({ nickname: 'a' })), Box.pack(row({ nickname: 'b' })), Box.pack(row({ nickname: 'c' }))];
  const edited = Box.replaceAt(three, 1, Box.pack(row({ nickname: 'B', level: 70 })));
  eq('1匹の書き換えで件数は変わらない', edited.length, 3);
  eq('書き換えるのは指定した1匹だけ(並び順も同じ)', edited.map((x) => x[0]), ['a', 'B', 'c']);
  eq('ほかの個体は同じ内容のまま', [edited[0], edited[2]], [three[0], three[2]]);
  eq('元の配列は書き換えない', three.map((x) => x[0]), ['a', 'b', 'c']);
  eq('範囲外の番号なら何も変えない', [Box.replaceAt(three, 3, three[0]), Box.replaceAt(three, -1, three[0])].map((x) => x.map((y) => y[0]).join('')), ['abc', 'abc']);
  eq('BOXのCSVは3のCSVと同じ', Box.csv([Box.pack(r)]), Csv.build([r]));
  eq('レベルとスキルレベルが空でも戻せる', Box.unpack(JSON.parse(JSON.stringify(Box.pack(row({ level: NaN, skillLevel: '' }))))).level, NaN);
  const n = 9; // 試験用の番号(実際の BOX 1・2 には触らない)
  eq('保存して読み出せる', Box.save(n, { name: 'てすと', rows: [Box.pack(r), Box.pack(r)] }) && Box.load(n).rows.length, 2);
  eq('名前も一緒に保存される', Box.load(n).name, 'てすと');
  localStorage.setItem(Box.key(n), '{こわれた');
  eq('壊れた保存は空として読む', Box.load(n), { name: '', rows: [], broken: true });
  localStorage.removeItem(Box.key(n));
  eq('何もなければ空', Box.load(n), { name: '', rows: [], broken: false });
}

// BOX への CSV の読み込み(個体は3を通さず、BOX へ直接足す)
{
  const sheet = [
    'ニックネーム,ポケモン,レベル,食材1,食材2,食材3,せいかく,Lv10',
    'しぐれ,カメックス,61,モーモーミルク,モーモーミルク,モーモーミルク,ひかえめ,おてつだいスピードM',
    'もち,Bulbasaur,30,Honey,,,Jolly,ねむけ',
    'こわれ,フシギダネ,,あまいミツ,,,ようき,',
  ].join('\n');
  const r = Import.parse(sheet);
  const packed = r.rows.map(Box.pack);
  eq('読み込んだ個体は BOX に入る形にできる(3匹)', packed.length, 3);
  eq('正しい個体は要確認にならない', Box.needsCheck(packed[0]), false);
  eq('辞書にない名前・性格・サブスキルの個体は要確認', Box.needsCheck(packed[1]), true);
  eq('レベルがない個体も要確認', Box.needsCheck(packed[2]), true);
  eq('オレンジ枠にする項目(辞書にない名前・性格・サブ)', Box.lowKeys(Box.unpack(packed[1])), ['species', 'nature', 'sub0']);
  eq('オレンジ枠にする項目(レベルなし)', Box.lowKeys(Box.unpack(packed[2])), ['level']);
  eq('正しい個体には枠を付けない', Box.lowKeys(Box.unpack(packed[0])), []);
  eq('要確認の個体も保存して読み出せる', (() => { const n = 8; Box.save(n, { name: '', rows: packed }); const b = Box.load(n); localStorage.removeItem(Box.key(n)); return b.rows.map(Box.needsCheck); })(), [false, true, true]);
  eq('要確認の個体を直すと(レベルを入れると)要確認でなくなる', Box.needsCheck(Box.pack({ ...Box.unpack(packed[2]), level: 40 })), false);
  eq('250匹いるBOXに70匹の読み込みは入りきらない', Box.plan(70, [250, 0])[0], { fits: false, room: 50 });
  eq('もう一方のBOXなら入る', Box.plan(70, [250, 0])[1].fits, true);
  eq('ちょうど300匹になる読み込みは入る', Box.plan(50, [250, 0])[0].fits, true);
}

// CSV・TSV の読み込み
{
  const pick = (r) => ({ nickname: r.nickname, species: r.species, level: r.level, skillLevel: r.skillLevel, ing: r.ing, nature: r.nature, sub: r.sub, shiny: r.shiny, mint: r.mint, ribbon: r.ribbon });
  const mine = [
    row({ nickname: 'たろう', skillLevel: 6, shiny: true, mint: true, ribbon: 1000, sub: ['おてつだいボーナス', 'きのみの数S', '', '', ''] }),
    row({ nickname: 'a,b "c"', species: 'カメックス', level: 61, skillLevel: 5, ing: ['モーモーミルク', 'モーモーミルク', 'マメミート'], nature: 'ひかえめ', sub: ['スキル確率アップM', '', '', '', ''] }),
    row({ nickname: '', skillLevel: '', ribbon: 200 }),
  ];
  const back = Import.parse(Csv.build(mine));
  eq('このアプリのCSVは往復して同じ内容に戻る', back.rows.map(pick), mine.map((r) => pick({ ...r, ribbon: r.ribbon ?? 0, mint: !!r.mint, shiny: !!r.shiny })));
  eq('往復で確認の印も注意も付かない', back.rows.map((r) => [r.low.length, r.notes.length]), [[0, 0], [0, 0], [0, 0]]);
  eq('往復で問題は出ない', back.problems, []);

  const nito = [
    'ニックネーム,ポケモン,レベル,スキルレベル,食材1,食材2,食材3,メインスキル,せいかく,まっしろミント,Lv10,Lv25,Lv50,Lv70,Lv80,一緒に眠った時間,色違い,お気に入り',
    'しぐれ,カメックス,61,5,モーモーミルク,モーモーミルク,モーモーミルク,食材ゲットS,ひかえめ,1,おてつだいスピードM,きのみの数S,,,,700,1,🔴🔵',
    ',フシギダネ,30,3,あまいミツ,あんみんトマト,,,ようき,0,,,,,,0,0,',
  ].join('\n');
  const n = Import.parse(nito);
  eq('個体値計算機の日本語のエクスポート: 2匹読める', n.rows.length, 2);
  eq('個体値計算機: 名前・レベル・食材・性格', [n.rows[0].nickname, n.rows[0].species, n.rows[0].level, n.rows[0].skillLevel, n.rows[0].ing, n.rows[0].nature], ['しぐれ', 'カメックス', 61, 5, ['モーモーミルク', 'モーモーミルク', 'モーモーミルク'], 'ひかえめ']);
  eq('個体値計算機: サブスキルは Lv10/25/50/70/80 の順', n.rows[0].sub, ['おてつだいスピードM', 'きのみの数S', '', '', '']);
  eq('個体値計算機: 700時間は500の段階、ミントと色違いは1', [n.rows[0].ribbon, n.rows[0].mint, n.rows[0].shiny], [500, true, true]);
  eq('個体値計算機: メインスキルとお気に入りは読まない(印も付かない)', [n.rows[0].low, n.rows[0].notes], [[], []]);
  eq('個体値計算機: 食材3が空でも読める', [n.rows[1].ing, n.rows[1].ribbon, n.rows[1].mint], [['あまいミツ', 'あんみんトマト', ''], 0, false]);
  eq('ribbon の段階の区切り', ['199', '200', '499', '500', '999', '1000', '1999', '2000', '', 'x'].map((h) => Import.parse(`ポケモン,ribbon\nフシギダネ,${h}`).rows[0].ribbon), [0, 200, 200, 500, 500, 1000, 1000, 2000, 0, 0]);

  const en = Import.parse('Pokemon,Ingredient 1,sleeping time shared,mint,shiny,nickname,level,nature,skill level\nフシギダネ,あまいミツ,1000,true,TRUE,さん,10,ようき,2');
  eq('英語の列名と順番違い、true も受け付ける', pick(en.rows[0]), { nickname: 'さん', species: 'フシギダネ', level: 10, skillLevel: 2, ing: ['あまいミツ', '', ''], nature: 'ようき', sub: ['', '', '', '', ''], shiny: true, mint: true, ribbon: 1000 });
  const tsv = Import.parse('ニックネーム\tポケモン\tレベル\nたろう\tフシギダネ\t12');
  eq('タブ区切り(TSV)も読める', [tsv.rows[0].nickname, tsv.rows[0].species, tsv.rows[0].level], ['たろう', 'フシギダネ', 12]);
  const bom = Import.parse('﻿nickname,Pokemon,level\r\nあ,フシギダネ,5\r\nい,フシギダネ,6\r\n');
  eq('BOM と CRLF があっても読める', bom.rows.map((r) => r.nickname + r.level), ['あ5', 'い6']);
  eq('ニックネームのカンマ・引用符・値の中の改行', Import.parse('nickname,Pokemon,level\n"a,b ""c""",フシギダネ,5\n"x\ny",フシギダネ,6').rows.map((r) => r.nickname), ['a,b "c"', 'x\ny']);
  eq('行番号は値の中の改行を数える', Import.parse('nickname,Pokemon,level\n"x\ny",フシギダネ,6\nz,フシギダネ,7').rows.map((r) => r.line), [2, 4]);

  const odd = Import.parse('nickname,Pokemon,level,nature,Lv10,ing 2\nあ,ポケモンでない,5,ふしぎ,ねむけ,へんなもの');
  eq('辞書にない名前は種族を空にして印と注意を付ける', [odd.rows[0].species, odd.rows[0].nickname, odd.rows[0].low.includes('species')], ['', 'あ', true]);
  eq('辞書にない性格・サブ・食材は値を残して印を付ける', [odd.rows[0].nature, odd.rows[0].sub[0], odd.rows[0].ing[1], odd.rows[0].low.slice(1)], ['ふしぎ', 'ねむけ', 'へんなもの', ['ing', 'nature', 'sub0']]);
  eq('辞書にない値は3の検査で止まる(出力しない)', Match.checkRow({ ...odd.rows[0], pending: false }).errors.length > 0, true);
  eq('英語名は辞書にないので印が付く', Import.parse('Pokemon\nBulbasaur').rows[0].low, ['species', 'level']);
  eq('レベルがなければ印と注意を付ける', [Import.parse('Pokemon\nフシギダネ').rows[0].low, Number.isNaN(Import.parse('Pokemon\nフシギダネ').rows[0].level)], [['level'], true]);
  eq('食材1は種族で決まる(相手のインポートと同じ)', Import.parse('Pokemon,ing 1,ing 2\nフシギダネ,げきからハーブ,あんみんトマト').rows[0].ing, ['あまいミツ', 'あんみんトマト', '']);
  eq('空行は読み飛ばす', Import.parse('Pokemon,level\nフシギダネ,5\n\n,\nフシギダネ,6\n').rows.length, 2);

  eq('壊れた行: 引用符が閉じていない', Import.parse('nickname,Pokemon,level\nあ,フシギダネ,5\n"い,フシギダネ,6\nう,フシギダネ,7').problems, [{ line: 3, message: '引用符(")が閉じていません。ここから先は読めませんでした。' }]);
  eq('壊れた行より前の行は読める', Import.parse('nickname,Pokemon,level\nあ,フシギダネ,5\n"い,フシギダネ,6').rows.map((r) => r.nickname), ['あ']);
  eq('列名がなければ止める', Import.parse('あ,い,う\nえ,お,か').problems.length, 1);
  eq('個体値計算機のテキスト形式は対応外と案内する', /テキスト形式/.test(Import.parse('abcdefghijkl@nick').problems[0].message), true);
  eq('空の中身', Import.parse('  \n').rows.length + Import.parse('  \n').problems.length, 1);
  eq('列名だけで個体がなければ案内する', Import.parse('nickname,Pokemon,level').problems.length, 1);
  eq('UTF-8 のバイト列を読める', Import.decode(new TextEncoder().encode('ポケモン')), 'ポケモン');
  eq('Shift_JIS のバイト列も読める', Import.decode(new Uint8Array([0x83, 0x7C, 0x83, 0x50, 0x83, 0x82, 0x83, 0x93]).buffer), 'ポケモン');
}

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

// ポケモンのレベルの読み取り
eq('ゲームの最大レベルは70', Match.GAME_MAX_LEVEL, 70);
eq('レベル2桁', Match.levelFrom('23'), 23);
eq('レベル1桁', Match.levelFrom('7'), 7);
eq('最大レベルは通る', Match.levelFrom('70'), 70);
eq('最大レベルを超える値は認めない(「Lv.1」を「71」と読む誤読も止まる)', Match.levelFrom('71'), null);
eq('3桁は認めない', Match.levelFrom('123'), null);
eq('0は認めない', Match.levelFrom('0'), null);
eq('読めなければ null', Match.levelFrom(''), null);
eq('数字以外が混じれば null', Match.levelFrom('2x3'), null);
const cols = (s) => [...s].map((c) => c === '#');
eq('「Lv. 23」の数字の範囲は、いちばん広いすき間より右', Reader.levelDigitSpan(cols('##.###.#....##.##')), [12, 16, 2]);
eq('「Lv. 1」の細い数字も拾う', Reader.levelDigitSpan(cols('##.###.#.....#')), [13, 13, 1]);
eq('接した数字は1かたまり(桁数の下限は1)', Reader.levelDigitSpan(cols('##.###.#....#####')), [12, 16, 1]);
eq('緑の文字が1かたまりなら読まない', Reader.levelDigitSpan(cols('..####..')), null);
eq('緑の文字がなければ読まない', Reader.levelDigitSpan(cols('......')), null);

// 画面の目印。画像は持たず、色の領域で画面を組み立てる(幅900の画面)
const GREEN = [30, 220, 90], RED = [255, 120, 85], ORANGE = [255, 190, 60], WHITE = [255, 255, 255];
const screen = (...rects) => ({
  W: 900, H: 2000,
  px: (x, y) => rects.find(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1)?.[4] ?? WHITE,
});
const band = (y, h = 50) => [0, y, 900, y + h, GREEN];
const nameCard = [0, 120, 30, 270, RED];
const skillBand = band(735), statusBand = band(1590);
const frame = [[50, 850, 850, 854, ORANGE], [50, 1040, 850, 1054, ORANGE]];
const spot = (r) => (r ? { skill: r.skill.a, status: r.status.a, frameBottom: r.frameBottom } : null);
const expected = { skill: 735, status: 1590, frameBottom: 1053 };

eq('帯が2本の画面', spot(Reader.locate(screen(nameCard, skillBand, statusBand, ...frame))), expected);
eq('上に「おてつだい能力」の帯が写る画面', spot(Reader.locate(screen(nameCard, band(7), skillBand, statusBand, ...frame))), expected);
eq('上の帯の下に、中央だけオレンジの絵がある画面', spot(Reader.locate(screen(nameCard, band(7), [420, 300, 480, 360, ORANGE], skillBand, statusBand, ...frame))), expected);
eq('上の帯が細く切れている画面', spot(Reader.locate(screen(nameCard, band(0, 10), skillBand, statusBand, ...frame))), expected);
eq('メインスキルの枠がなければ見つからない', Reader.locate(screen(nameCard, band(7), skillBand, statusBand)), null);
eq('詳細ステータスの帯がなければ見つからない', Reader.locate(screen(nameCard, band(7), skillBand, ...frame)), null);

// 読み取り用データの読み込み。失敗しても止まらない
const outcome = (p) => p.then((v) => `成功 ${v}`, () => '失敗');
async function loadTests() {
  const never = new Promise(() => {});
  eq('読み込めれば使える', await outcome(Reader.startWorker(async () => 'worker', 'eng', {}, 1000)), '成功 worker');
  eq('作成の失敗で止まらない', await outcome(Reader.startWorker(() => Promise.reject(new Error('x')), 'eng', {}, 1000)), '失敗');
  eq('言語データの失敗で止まらない', await outcome(Reader.startWorker((lang, o) => { o.errorHandler('404'); return never; }, 'eng', {}, 1000)), '失敗');
  eq('返事がなくても時間切れで止まらない', await outcome(Reader.startWorker(() => never, 'eng', {}, 10)), '失敗');
}

loadTests().finally(() => {
  const failed = results.filter((r) => !r.ok);
  document.getElementById('out').textContent =
    `${results.length}件中 ${results.length - failed.length}件成功\n` +
    failed.map((r) => `NG ${r.name}${r.detail}`).join('\n');
  window.testResult = { total: results.length, failed: failed.map((r) => r.name) };
});

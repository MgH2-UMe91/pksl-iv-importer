"""data/pokemon.js を作る。実行は手動で、サイトの動作には不要。

  python tools/build_data.py <取得物のフォルダ>

取得物のフォルダに置くもの:
  nerolis-lab/nerolis-lab (Apache-2.0) の common/src/types/pokemon/ から
    all-pokemon.ts, berry-pokemon.ts, ingredient-pokemon.ts, skill-pokemon.ts
    (タイプは、ポケモンのきのみ(berry)のタイプ。きのみは common/src/types/berry/berries.ts)
  nerolis-lab/nerolis-lab (Apache-2.0) の common/src/types/berry/berries.ts
  PokeAPI/pokeapi (BSD-3-Clause) の data/v2/csv/pokemon_species_names.csv
"""
import csv
import json
import math
import re
import sys
from pathlib import Path

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / 'data' / 'pokemon.js'

ING = {
    'LARGE_LEEK': 'ふといながねぎ', 'TASTY_MUSHROOM': 'あじわいキノコ', 'FANCY_EGG': 'とくせんエッグ',
    'SOFT_POTATO': 'ほっこりポテト', 'FANCY_APPLE': 'とくせんリンゴ', 'FIERY_HERB': 'げきからハーブ',
    'BEAN_SAUSAGE': 'マメミート', 'MOOMOO_MILK': 'モーモーミルク', 'HONEY': 'あまいミツ',
    'PURE_OIL': 'ピュアなオイル', 'WARMING_GINGER': 'あったかジンジャー', 'SNOOZY_TOMATO': 'あんみんトマト',
    'SOOTHING_CACAO': 'リラックスカカオ', 'SLOWPOKE_TAIL': 'おいしいシッポ', 'GREENGRASS_SOYBEANS': 'ワカクサ大豆',
    'GREENGRASS_CORN': 'ワカクサコーン', 'ROUSING_COFFEE': 'めざましコーヒー', 'PLUMP_PUMPKIN': 'ずっしりカボチャ',
    'GLOSSY_AVOCADO': 'つやつやアボカド',
}

# 食材の強さ(nerolis-lab の common/src/types/ingredient/ingredients.ts)。個数の計算に使う
VALUE = {
    'FANCY_APPLE': 90, 'MOOMOO_MILK': 98, 'GREENGRASS_SOYBEANS': 100, 'HONEY': 101, 'BEAN_SAUSAGE': 103,
    'WARMING_GINGER': 109, 'SNOOZY_TOMATO': 110, 'FANCY_EGG': 115, 'PURE_OIL': 121, 'SOFT_POTATO': 124,
    'FIERY_HERB': 130, 'GREENGRASS_CORN': 140, 'SOOTHING_CACAO': 151, 'ROUSING_COFFEE': 153, 'GLOSSY_AVOCADO': 162,
    'TASTY_MUSHROOM': 167, 'LARGE_LEEK': 185, 'PLUMP_PUMPKIN': 250, 'SLOWPOKE_TAIL': 342,
}


def amounts(ing, factor):
    """[Lv30のa, Lv30のb, Lv60のa, Lv60のb, Lv60のc]。詳細画面の x2 などの数字と同じ値"""
    def amount(drop, level):
        return math.floor(VALUE[ing[0]] * level * factor / VALUE[drop] + 0.5)
    out = [amount(ing[0], 2.25), amount(ing[1], 2.25), amount(ing[0], 3.6), amount(ing[1], 3.6)]
    return out + [amount(ing[2], 3.6)] if len(ing) > 2 else out


# 種族名だけでは区別できない姿。表記は取り込み先が受け付けるものに合わせる
FORMS = {
    'PIKACHU_HALLOWEEN': 'ピカチュウ(ハロウィン)',
    'PIKACHU_HOLIDAY': 'ピカチュウ(ホリデー)',
    'PIKACHU_CAPTAIN': 'ピカチュウ(キャプテン)',
    'EEVEE_HOLIDAY': 'イーブイ(ホリデー)',
    'EEVEE_HALLOWEEN': 'イーブイ(ハロウィン)',
    'SPHEAL_HOLIDAY': 'タマザラシ(ホリデー)',
    'VULPIX_ALOLAN': 'ロコン(アローラ)',
    'NINETALES_ALOLAN': 'キュウコン(アローラ)',
    'WOOPER_PALDEAN': 'ウパー(パルデア)',
    'PUMPKABOO_SMALL': 'バケッチャ(こだましゅ)',
    'PUMPKABOO_MEDIUM': 'バケッチャ(ちゅうだましゅ)',
    'PUMPKABOO_LARGE': 'バケッチャ(おおだましゅ)',
    'PUMPKABOO_JUMBO': 'バケッチャ(ギガだましゅ)',
    'GOURGEIST_SMALL': 'パンプジン(こだましゅ)',
    'GOURGEIST_MEDIUM': 'パンプジン(ちゅうだましゅ)',
    'GOURGEIST_LARGE': 'パンプジン(おおだましゅ)',
    'GOURGEIST_JUMBO': 'パンプジン(ギガだましゅ)',
    'TOXTRICITY_AMPED': 'ストリンダー(ハイ)',
    'TOXTRICITY_LOW_KEY': 'ストリンダー(ロー)',
}

# きのみ -> タイプ(ポケモンスリープのタイプは、そのポケモンのきのみのタイプ)
BERRY_TYPE = dict(re.findall(r"export const ([A-Z0-9_]+): Berry = \{\s*name: '[A-Z0-9_]+',\s*value: \d+,\s*type: '([a-z]+)'", (SRC / 'berries.ts').read_text(encoding='utf-8')))
if len(BERRY_TYPE) != 18:
    raise SystemExit(f'きのみのタイプが18件ではありません: {len(BERRY_TYPE)}')

names = {}
with open(SRC / 'pokemon_species_names.csv', encoding='utf-8') as f:
    for row in csv.DictReader(f):
        if row['local_language_id'] == '11':
            names[int(row['pokemon_species_id'])] = row['name']

entry = re.compile(r'export const ([A-Z0-9_]+): Pokemon = (\w+)\(\s*(?:([A-Z0-9_]+),\s*)?\{(.*?)\n\}\);', re.S)
mons, order = {}, []
for fn in ['all-pokemon.ts', 'berry-pokemon.ts', 'ingredient-pokemon.ts', 'skill-pokemon.ts']:
    text = (SRC / fn).read_text(encoding='utf-8')
    # 姿違いで共有している項目(...xxxSharedStats)を展開する
    for shared, content in re.findall(r'const (\w+SharedStats) = \{(.*?)\n\};', text, re.S):
        text = text.replace(f'...{shared},', content + ',')
    for const, ctor, base, body in entry.findall(text):
        no = re.search(r'pokedexNumber: (\d+)', body)
        m = {'const': const, 'base': base or None, 'no': int(no.group(1)) if no else None, 'factor': 2 if fn == 'ingredient-pokemon.ts' else 1}
        ab = re.search(r'ingredients: \{\s*a: (\w+),\s*b: (\w+)(?:,\s*c: (\w+))?', body)
        if ab:
            m['ing'] = [x for x in ab.groups() if x]
        if 'ingredient0:' in body:
            m['myth'] = sorted({x for x in re.findall(r'ingredient: (\w+)', body) if x in ING}, key=list(ING).index)
        bk = re.search(r'berry: ([A-Z0-9_]+)', body)
        if bk:
            m['berry'] = bk.group(1)
        sk = re.search(r'skill: (\w+)', body)
        if sk:
            m['skill'] = sk.group(1)
        mons[const] = m
        order.append(const)
    declared = len(re.findall(r'export const [A-Z0-9_]+: Pokemon\b', text))
    print(fn, 'declared', declared)


def inherit(m, key):
    while m is not None:
        if key in m:
            return m[key]
        m = mons.get(m['base'])
    return None


rows = []
for const in order:
    m = mons[const]
    name = FORMS.get(const) or names.get(m['no'])
    if not name:
        raise SystemExit(f'名前なし {const} {m["no"]}')
    row = {'no': m['no'], 'name': name}
    myth = inherit(m, 'myth')
    if myth:
        row['myth'] = [ING[x] for x in myth]
    else:
        ing = inherit(m, 'ing')
        if not ing:
            raise SystemExit(f'食材なし {const}')
        row['ing'] = [ING[x] for x in ing]
        row['amt'] = amounts(ing, m['factor'])
    berry = inherit(m, 'berry')
    if berry not in BERRY_TYPE:
        raise SystemExit(f'きのみのタイプなし {const} {berry}')
    row['type'] = BERRY_TYPE[berry]
    if inherit(m, 'skill') == 'Versatile':
        row['versatile'] = True
    rows.append(row)

rows.sort(key=lambda r: (r['no'], r['name']))
dup = {r['name'] for r in rows if sum(1 for x in rows if x['name'] == r['name']) > 1}
if dup:
    raise SystemExit(f'名前の重複 {dup}')

lines = ',\n'.join('  ' + json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows)
OUT.write_text(
    "// tools/build_data.py の生成物。手で直さない。出どころは README.md を参照\n"
    "'use strict';\n\n"
    f"const POKEMON = [\n{lines}\n];\n",
    encoding='utf-8', newline='\n')
print(len(rows), 'species ->', OUT)

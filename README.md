# スクショ取り込みツール for 個体値計算機

ポケモンスリープの1匹の詳細画面のスクショから、名前・ニックネーム・性格・サブスキル・食材を読み取り、確認・編集してから、nitoyon 氏の[個体値計算機](https://nitoyon.github.io/pokesleep-tool/iv/)のボックスへ取り込める CSV を作る静的サイトです。

- 非公式のファンツールです。株式会社ポケモン、任天堂、個体値計算機の作者とは関係ありません。
- 画像は端末の外へ送りません。文字の認識はブラウザの中で行います。
- ボックスへ直接は書き込めません。CSV をコピーして、ツールのインポート画面に貼り付けてください。

## 開発

ビルドは不要です。静的ファイルをそのまま配信します。

- 開発サーバー: `python -m http.server 8790`
- テスト: `tests/index.html` をブラウザで開く
- 辞書の作り直し: `tools/build_data.py` の説明を参照
- アプリアイコンの作り直し: `python tools/build_icons.py`

## データの出どころとライセンス

| 対象 | 出どころ | ライセンス |
| --- | --- | --- |
| `data/pokemon.js` の種族と食材 | [nerolis-lab](https://github.com/nerolis-lab/nerolis-lab) | Apache-2.0 |
| `data/pokemon.js` の日本語の種族名 | [PokeAPI](https://github.com/PokeAPI/pokeapi) | BSD-3-Clause |
| `vendor/` | [Tesseract.js](https://github.com/naptha/tesseract.js) と学習データ | Apache-2.0(`vendor/README.txt`) |

個体値計算機のリポジトリには LICENSE が見当たらないため、コードとデータはコピーしていません。ただし姿違いの種族名の表記は、取り込みに必要なので個体値計算機が受け付ける表記に合わせています。

`data/icons.js` の食材アイコンと `icons/` のアプリアイコンは、ゲームの画像を使わず図形で描いたものです。

ポケモンの名称などの権利は各権利者に帰属します。

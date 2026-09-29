# 旅ガチャ（TABI GACHA）

ソーシャルゲームのガチャ風に、日本地図を光らせて旅先を抽選する Web アプリです。
ビルド不要の静的サイト（HTML / CSS / ES Modules）なので、GitHub に push して Vercel に接続するだけで公開できます。

## 遊び方

1. 「住んでいる地域」と「旅先の距離（おまかせ / 近く / 遠く）」を選ぶ
2. **旅先を決める** … 地域ルーレットが回る（この時点で内部的に都道府県まで決定）
3. **行き先を決める** … 地域が止まって地域名を表示
4. **都道府県を決める** … 地域にズームして都道府県ルーレット
5. **行き先を決める** … 都道府県が決定し、観光地・温泉・郷土料理を表示
6. **詳細を見る** … 観光地・温泉・郷土料理・お土産・おすすめシーズンの一覧

## 抽選仕様

| 項目 | 内容 |
| --- | --- |
| 抽選地域 | 北海道・東北 / 関東 / 中部 / 近畿 / 中国 / 四国 / 九州・沖縄 |
| おまかせ | 全47都道府県から一様にランダム |
| 近く | 住んでいる地域が属する抽選地域の中から（例：沖縄 → 九州・沖縄） |
| 遠く | 住んでいる地域が属する抽選地域以外から |
| レア演出 | 結果が 北海道・東京・大阪・沖縄 のとき 2/3 の確率で、日本全体が虹色に光り地域名が「？？？」 |
| ダミーレア演出 | 上記4都道府県を含む地域（北海道・東北 / 関東 / 近畿 / 九州・沖縄）の他の都道府県のとき 1/5 の確率で同じ演出 |
| 演出中の都道府県ルーレット | 日本全体を光らせたまま回し、決定するまで地域がわからない |

- 乱数は `crypto.getRandomValues` を使用しています。
- ブラウザのコンソールで `tabiGachaSimulate(100000, 'kanto', 'random')` を実行すると演出の出現率を確認できます。

## ディレクトリ構成

```
index.html
css/style.css
js/
  main.js      画面の状態遷移・演出
  lottery.js   抽選ロジック（純粋関数）
  data.js      地域・居住地・都道府県の観光テーブル
  map.js       SVG 日本地図の生成・発光・ズーム
  map-data.js  都道府県の SVG パス（自動生成）
  sound.js     WebAudio による効果音
  fx.js        紙吹雪
tools/build_map.py  地図データ生成スクリプト
vercel.json         セキュリティヘッダー（CSP など）
jsconfig.json       JSDoc 型チェック（TypeScript LSP / `tsc -p jsconfig.json`）
```

観光データを増やす・直すときは `js/data.js` の `PREFECTURES` を編集してください。

## ローカルで動かす

ES Modules を使うため、ファイルを直接開くのではなくローカルサーバーで配信します。

```bash
python -m http.server 5173
```

→ http://localhost:5173

## デプロイ（GitHub + Vercel）

1. GitHub で空のリポジトリを作成し、このフォルダを push
2. [Vercel](https://vercel.com/new) で「Import Git Repository」→ 対象リポジトリを選択
3. Framework Preset は **Other**、Build Command / Output Directory は空のまま **Deploy**

以降は GitHub に push するたびに自動デプロイされます。

## 地図データ

`js/map-data.js` は [dataofjapan/land](https://github.com/dataofjapan/land) の `japan.topojson`（出典：地球地図日本／国土地理院）を加工して生成しています。

```bash
python tools/build_map.py path/to/japan.topojson
```

- 伊豆・小笠原諸島の南部、トカラ・奄美、大東諸島は表示上省略しています。沖縄県は左上に 1.5 倍で配置しています。
- 利用条件：非営利の場合は出典の明記、営利目的の場合は出典の明記に加えて著作権者（地球地図日本）への利用報告が必要です。

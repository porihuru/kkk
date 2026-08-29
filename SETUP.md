# kkk - 令和8年度入札公告管理システム セットアップガイド

## 概要

このシステムは、防衛省陸上自衛隊北部方面隊が公開している「入札公告一覧」HTMLを、解析・編集・再生成・ZIP配布するWebアプリケーションです。

### 主な機能

- **HTML取り込み** - 既存の入札公告HTMLを解析し、公告データ・注意事項・外部リンクを抽出
- **公告管理** - 公告情報の新規作成・修正・削除（CSVモード）
- **データ編集** - 駐屯地、入札日、品名、PDFリンクを編集可能
- **公開プレビュー** - 編集結果をブラウザで確認
- **データ出力** - CSV形式でデータを出力
- **HTML再生成** - 編集したデータから新しい公告一覧HTMLを生成
- **ZIP配布** - HTMLとPDFファイルをまとめてZIP形式で出力

### HTMLテンプレートの扱い

生成HTMLの元ファイルは`config/koukoku.html`です。生成時に変更するのは、基準日と公告テーブルの行データだけです。テンプレートのデザイン、タグ構造、検索・ソート処理はそのまま保持します。

## ファイル構成

```
kkk/
├── index.html              # メインUI
├── css/
│   └── style.css          # UIスタイルシート
├── js/
│   ├── app.js             # メインアプリケーション
│   ├── html-import.js     # HTML解析エンジン
│   ├── html-export.js     # HTML生成エンジン
│   ├── csv-data.js        # CSV処理
│   ├── data-service.js    # データ永続化層（SharePoint対応）
│   ├── zip-export.js      # ZIP生成
│   └── sp.js              # SharePoint連携
├── csv/
│   ├── kokoku.csv         # 公告データ
│   ├── links.csv          # PDF・外部リンク
│   └── settings.csv       # 基準日（date 1行のみ）
├── config/                # 設定ファイル・koukoku.html原本
├── README.md              # このファイル
└── SETUP.md              # セットアップガイド（このファイル）
```

## 使用方法

### 1. ブラウザで開く

```bash
index.html をブラウザで開く
```

### 2. 既存HTMLを取り込む（管理者のみ）

**方法A: ファイルアップロード**
- 「既存HTML取り込み」セクションから、HTMLファイルを選択
- 「ファイルを解析」ボタンをクリック

**方法B: HTMLソース貼り付け**
- R8kokoku.htmlのソースを コピー＆ペースト
- 「ソースを解析」ボタンをクリック

取り込まれた内容：
- 公告データ（区分、駐屯地、品名、入札日、備考）
- PDFリンク（複数対応）
- 表上部設定（基準日のみ）

### 3. データを編集

**公告の新規追加**
1. 区分、駐屯地、入札日、状態を選択
2. 品名、備考を入力
3. PDF表示名、PDFリンク（R8/be/xxx.pdf 形式）を入力
4. PDFファイルを選択（オプション）
5. 「保存」をクリック

**既存公告の修正**
1. 一覧から「修正」ボタンをクリック
2. 各項目を修正
3. 「保存」をクリック

**公告の削除**
1. 一覧から「削除」ボタンをクリック
2. 確認ダイアログで「OK」

**表上部設定の編集**
- 基準日のみ修正可能
- タイトル、注意事項、外部リンクは`config/koukoku.html`の原本を保持

### 4. データを出力

**CSV形式**
- 「公告CSV出力」 → kokoku.csv
- 「リンクCSV出力」 → links.csv  
- 「設定CSV出力」 → settings.csv

**公開ページHTML**
- 「公開ページプレビュー」 → ブラウザで確認
- 「HTML出力」 → R8kokoku.html（ダウンロード）

**ZIP配布ファイル**
- 「更新分ZIP」 → 新規・変更分のHTMLとPDFを圧縮
- 「全データZIP」 → 全公告のHTMLとPDFを圧縮

## 技術仕様

### HTMLテンプレート構造

生成HTML は以下の構造を採用（添付R8kokoku.htmlに準拠）：

```html
<!-- 2段の上部テーブル -->
<table>
  <!-- 1段目：タイトル + 注意事項 -->
  <tr>
    <th><h1>令和8年度<span color="red">入札公告</span>一覧</h1></th>
    <th><br>区切り注意事項</br>...</th>
  </tr>
  <!-- 2段目：基準日 -->
  <tr><th colspan="2">令和８年８月２７日現在</th></tr>
</table>

<!-- 検索・フィルタテーブル -->
<table>
  <tr>
    <th>品名等で検索: <input id="searchInput">
        駐屯地で検索: <select id="searchInput2">...</select>
    </th>
  </tr>
</table>

<!-- 公告データテーブル -->
<table id="myTable" border="1" style="background-color: #008b8b;">
  <thead>
    <tr style="background-color: #008b8b; color: white;">
      <th>区分</th>
      <th>駐屯地</th>
      <th>品名</th>
      <th>入札日▲▼</th>
      <th>備考</th>
    </tr>
  </thead>
  <tbody>
    <!-- 交互背景色（#fafdff, #f0fff0） -->
    <tr style="background-color: #fafdff;">
      <td align="center"><font color="red">NEW</font></td>
      ...
    </tr>
  </tbody>
</table>
```

### データ構造

**公告（Announcement）**
```
{
  ID: "1",                    // 一意識別子
  Category: "NEW",            // 区分：NEW, 変更, 削除, または空文字
  Garrison: "札幌",          // 駐屯地
  BidDate: "R8.9.10",        // 入札日
  Remarks: "",               // 備考
  Sort: "1",                 // 表示順序
  Status: "公開"             // 状態：公開, 公開済み, 下書き, 公開停止
}
```

**リンク（Link）**
```
{
  ID: "1",                   // 一意識別子
  KokokuID: "1",            // 属する公告ID
  Text: "品名 ほか99件",    // 表示テキスト
  FileName: "080827-xxx.pdf", // ファイル名
  URL: "R8/be/080827-xxx.pdf", // リンク先（相対パス）
  Type: "公告",             // リンク種別：公告, 変更公告
  Sort: "1"                 // 複数リンク時の順序
}
```

**設定（Setting）**
```
{
  ID: "1",
  Type: "date",             // date 固定
  Text: "令和８年８月２７日現在",
  URL: "",                  // 未使用
  Sort: "1"
}
```

表上部の設定は基準日1件のみです。タイトル、注意事項、外部リンクは`config/koukoku.html`をそのまま使用します。

### HTML解析ルール

- 第1テーブルの右側セル（th[1]）から注意事項を行単位で抽出
- 1段目テーブルのアンカーから外部リンクを抽出
- 公告テーブルの各行からデータを抽出（5列以上）
- 空の `https://.pdf/` リンクは自動除外
- 絶対URLは相対パス（R8/be/...）に変換
- ファイル名は URLから自動抽出

### 検索・フィルタ機能（生成HTML側）

```javascript
// JavaScript で実装
- キーワード検索（品名、駐屯地、備考）
- 駐屯地セレクトボックス選択
- 入札日▲▼ でソート可能
- リアルタイムフィルタリング
```

## SharePoint連携（オプション）

`data-service.js` を設定することで、SharePointオンラインへのデータ永続化が可能です。

- CSV/HTML手動出力（既定）
- SharePoint連携で自動保存（オプション）

## ブラウザ対応

- Chrome 最新版
- Firefox 最新版
- Edge 最新版
- Safari 最新版
- IE 11（部分対応）

## トラブルシューティング

**Q: HTML取り込み後、表が表示されない**
A: HTMLの構造を確認してください。添付R8kokoku.htmlと同じ1段目テーブル構造が必須です。

**Q: PDFリンクが生成されない**
A: PDFリンクの URL が `https://.pdf/` 形式でないこと、また有効な href 属性を持つことを確認してください。

**Q: ZIPが生成されない**
A: ブラウザのコンソール（F12）でエラーを確認してください。ZipExport.createが正常に動作しているか確認します。

**Q: SharePointへの保存に失敗する**
A: data-service.jsの設定、SharePointサイトのURL、認証情報を確認してください。

## 開発者情報

### 使用技術
- HTML5, CSS3, JavaScript（フレームワークなし）
- ZIP.js（ZIP生成用）
- Fetch API（SharePoint連携用）

### リポジトリ
```
Owner: porihuru
Repository: kkk
Branch: main
```

### 最終更新

2026年8月29日

---

**最新情報・問い合わせ**
北部方面会計隊本部 財務管理官

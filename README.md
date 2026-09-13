# kkk - 令和8年度入札公告管理システム

## 1. プロジェクト概要

### 目的
防衛省陸上自衛隊北部方面隊が公開する「令和8年度入札公告一覧」HTMLを、ブラウザベースのWebアプリケーションで以下の処理を実現：

1. **取り込み** - 既存HTMLから構造化データを自動抽出
2. **編集** - データベース/メモリ上で公告情報を管理・修正
3. **生成** - 編集データから新しいHTMLを自動生成
4. **配布** - HTML + PDFをZIP形式でパッケージ化

### 対象ユーザー
- 北部方面会計隊本部の担当官（会計官、財務管理官）
- 各駐屯地の会計隊
- 入札情報の発行・更新・配布を行う部隊

### 実装形式
- **クライアントサイドWebアプリ** - ブラウザのみで動作
- **フレームワーク不使用** - Vanilla JavaScript（依存関係なし）
- **デュアルモード** - CSVモード（デフォルト）+ SharePoint連携モード（オプション）

### HTML生成の設計方針
- 元HTMLは`config/koukoku.html`をテンプレートとして使用
- 生成時に変更するのは、基準日と公告テーブルの文字・数値のみ
- テンプレートのデザイン、タグ構造、検索・ソート用スクリプトは変更しない
- 公告の追加・削除・修正は公告テーブルの行単位で反映する

## 2. 主な機能

- 📄 **HTML解析** - 既存の入札公告HTML（R8年度対応）を自動解析
  - 2段上部テーブルから設定情報抽出
  - 複数PDFリンク対応
  - 相対・絶対URL自動変換
  
- ✏️ **公告管理** - 公告の追加・修正・削除
  - CSVモードでメモリ上管理
  - SharePoint連携時は自動クラウド保存
  
- 🔍 **検索・フィルタリング** - キーワード検索、駐屯地別絞り込み、入札日ソート
  - クライアントサイド処理で高速フィルタリング
  
- 📊 **データ出力** - CSV形式でのデータエクスポート
  - 公告、リンク、設定の3ファイル出力
  
- 🌐 **HTML再生成** - 編集データから公告一覧HTMLを自動生成
  - 元のHTMLと完全互換の構造
  - ブラウザ上でリアルタイムプレビュー
  
- 📦 **ZIP配布** - HTMLとPDFをまとめてZIP形式で配布
  - 更新分ZIPと全データZIPの2パターン
  - ZIP.jsライブラリで実装
  
- ☁️ **SharePoint連携** - クラウドストレージへの自動保存（オプション）
  - Microsoft 365テナント対応
  - XMLHttpRequestによるREST API + SharePointのログインセッション

## クイックスタート

1. **ブラウザで開く**
   ```bash
   index.html をブラウザで開く
   ```

2. **HTMLを取り込む**
   - R8年度入札公告一覧HTMLをアップロード、または ソースコードを貼り付け

3. **公告を編集**
   - 新規追加、既存データの修正、削除

4. **データを出力**
   - CSV、HTML、ZIPなど複数形式で出力可能

## ファイル構成

```
kkk/
├── index.html           # メインUI
├── css/style.css       # UIスタイル
├── js/                 # JavaScriptモジュール
│   ├── app.js         # メインアプリケーション
│   ├── html-import.js # HTML解析エンジン
│   ├── html-export.js # HTML生成エンジン
│   ├── csv-data.js    # CSV処理
│   ├── zip-export.js  # ZIP生成
│   └── data-service.js# データ永続化層
├── csv/                # サンプルCSVデータ
├── config/             # 設定ファイル・koukoku.htmlテンプレート
├── SETUP.md           # 詳細セットアップガイド
└── README.md          # このファイル
```

## 技術スタック

- **フロントエンド**: HTML5 + CSS3 + Vanilla JavaScript
- **データ形式**: CSV, JSON, ZIP
- **クラウド連携**: SharePoint Online（オプション）
- **ブラウザ互換性**: Chrome, Firefox, Edge, Safari

## 3. アーキテクチャ詳細

### 3.1 システム全体図

```
┌─────────────────────────────────────────────────────────────┐
│                 Browser (Single Page App)                    │
├─────────────────────────────────────────────────────────────┤
│  index.html (UI) + style.css                               │
│         ↓                                                    │
│  js/app.js (メインアプリケーション)                          │
│  ├─→ js/html-import.js (HTML解析)                          │
│  ├─→ js/html-export.js (HTML生成)                          │
│  ├─→ js/csv-data.js (CSV処理)                              │
│  ├─→ js/zip-export.js (ZIP生成)                            │
│  └─→ js/data-service.js (データ永続化)                      │
│                 ↓                                            │
│          グローバル状態管理                                   │
│          - allAnnouncements[]                               │
│          - allLinks[]                                       │
│          - allSettings[]                                    │
└────────────────┬─────────────────────────────────────────────┘
                 │
         ┌───────┴────────────────────┐
         │                            │
    ┌────▼────────┐          ┌───────▼──────┐
    │  CSV Mode    │          │  SharePoint  │
    │  (デフォルト) │          │   Mode       │
    │  メモリ保存  │          │  (オプション) │
    │  手動DL      │          │  API連携     │
    └──────────────┘          └──────────────┘
```

### 3.2 データフロー

#### 取り込みフロー
```
既存 R8kokoku.html
        ↓
HtmlImport.parse(htmlSource)
  ├─ 1段目table → settingsFrom() → 注意事項抽出
  ├─ table rows → 公告行ごとに解析
  └─ anchors → PDFリンク抽出
        ↓
配列作成:
  - announcements[] {ID,Category,Garrison,BidDate,Remarks,Sort,Status}
  - links[] {ID,KokokuID,Text,FileName,URL,Type,Sort}
  - settings[] {ID,Type,Text,URL,Sort}
        ↓
app.js で replaceImportedData(data)
        ↓
メモリに格納：allAnnouncements, allLinks, allSettings
        ↓
render(allAnnouncements) でUI表示
```

#### 編集フロー
```
UI入力 (form submit)
        ↓
saveAnnouncement() / addSetting() / deleteAnnouncement()
        ↓
メモリ配列を更新
  - 新規: push()
  - 修正: splice() → 再挿入
  - 削除: splice()
        ↓
CSV Mode: メモリのみ
SharePoint Mode: DataService.add/update/remove()
        ↓
filterAnnouncements() で再フィルタ → render()
        ↓
UI更新
```

#### 出力フロー
```
メモリ状態 (allAnnouncements, allLinks, allSettings)
        ↓
        ├─→ CsvData.toCsv() ─→ kokoku.csv, links.csv, settings.csv
        ├─→ HtmlExport.create() ─→ R8kokoku.html
        │   └─→ HtmlExport.openPreview() でブラウザ新窓表示
        └─→ ZipExport.create() ─→ R8kokoku_update.zip or R8kokoku_full.zip
             (更新分 vs 全データ)
```

### 3.3 モジュール詳細仕様

#### **js/html-import.js** - HTML解析エンジン

**入力**
- HTMLソース (string)

**出力**
```javascript
{
  announcements: [
    {
      ID: "1",                    // 一意識別子 (内部生成)
      Category: "NEW",            // 区分: "NEW" | "" | "結果"
      Garrison: "札幌",          // 駐屯地名
      BidDate: "R8.9.10",        // 入札日
      Remarks: "",               // 備考
      Sort: "1",                 // ソート順序
      Status: "公告登録"          // 状態: "公告登録" | "内容修正" | "入札終了登録" | "公告反映済" | "結果反映済"
    },
    ...
  ],
  links: [
    {
      ID: "1",                   // 一意識別子
      KokokuID: "1",            // 属する公告ID
      Text: "品名 ほか99件",    // リンク表示テキスト
      FileName: "080827-xxx.pdf", // ファイル名（URL から自動抽出）
      URL: "R8/be/080827-xxx.pdf", // 相対URLパス
      Type: "公告",             // "公告" | "変更公告"
      Sort: "1"                 // 複数リンク時の順序
    },
    ...
  ],
  settings: [
    {
      ID: "1",
      Type: "date",             // date 固定
      Text: "令和８年８月２７日現在",
      URL: "",                  // 未使用
      Sort: "1"
    },
    ...
  ]
}
```

**解析ルール詳細**
1. **基準日抽出**
   - 「令和○年○月○日現在」の文字列だけを date として処理
   - タイトル、注意事項、外部リンクは原本テンプレートから変更しない

2. **リンク抽出**
   - 相対URL変換: `/nafin/R8/` 以降を抽出 → `R8/be/xxx.pdf`
   - ファイル名抽出: URL の最後の `/` 以降
   - `https://.pdf/` は自動除外（ダミーリンク）
   - 複数リンクは Sort 順で管理

3. **公告行解析**
   - テーブルの各 `<tr>` をスキャン
   - TD が 5個以上の行を処理対象
   - セル0: Category (区分)
   - セル1: Garrison (駐屯地)
   - セル2: PDFリンク群 (複数の `<a>` 要素)
   - セル3: BidDate (入札日)
   - セル4: Remarks (備考)

#### **js/html-export.js** - HTML生成エンジン

**入力**
```javascript
HtmlExport.create(
  announcements[],  // 公告配列
  links[],          // リンク配列
  settings[]        // 設定配列
)
```

**出力**
- 完全な R8kokoku.html テキスト（内自動スタイル+JavaScript含む）

**生成HTML構造**（完全準拠）

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>R8年度入札公告一覧</title>
  <style>
    /* 全スタイル内埋め込み */
    body { margin:0; background:#fff; }
    table { border-collapse:collapse; }
    th { background-color:#008b8b; color:white; }
    /* 追加スタイル... */
  </style>
</head>
<body>

<!-- ==== 1段目テーブル：タイトル + 注意事項 ==== -->
<table border="0" width="100%">
<colgroup>
  <col style="width:30%">
  <col style="width:70%">
</colgroup>
<tbody>
<tr>
  <th>
    <h1>令和8年度<span style="color:red;">入札公告</span>一覧</h1>
  </th>
  <th style="font-size:12px;text-align:left;">
    ■ 注意事項1<br>
    ■ 注意事項2<br>
    ■ <a href="https://...">外部リンク</a>
  </th>
</tr>
<tr>
  <th colspan="2" align="left"></th>
</tr>
</tbody>
</table>

<!-- ==== 2段目テーブル：検索UI ==== -->
<table width="100%">
<colgroup>
  <col style="width:60%">
  <col style="width:20%">
  <col style="width:20%">
</colgroup>
<tbody>
<tr>
  <th align="left">
    <label style="font-size:15px;">品名等で検索:</label>
    <input type="text" id="searchInput" 
           style="width:275px;height:25px;font-size:15px;border:1px solid black;"
           placeholder="キーワード">
    <br>
    <label style="font-size:15px;">駐屯地で検索:</label>
    <select id="searchInput2" 
            style="width:300px;height:25px;font-size:15px;border:1px solid black;border-radius:2px;">
      <option value="">全て</option>
      <option value="札幌">札幌</option>
      <option value="真駒内">真駒内</option>
      <!-- 駐屯地リスト自動生成 -->
    </select>
    <br>
    <label>令和８年８月２７日現在</label>
  </th>
</tr>
</tbody>
</table>

<!-- ==== 公告テーブル ==== -->
<table border="1" id="myTable" style="border-collapse:collapse;" 
       width="100%" cellpadding="3" cellspacing="0" align="left">
<colgroup>
  <col style="width:5%">
  <col style="width:20%">
  <col style="width:45%">
  <col style="width:15%">
  <col style="width:15%">
</colgroup>
<thead>
<tr style="background-color:#008b8b;color:white;" align="center">
  <th>区分</th>
  <th>駐屯地</th>
  <th>品名</th>
  <th id="sortDate" style="cursor:pointer;">入札日▲▼</th>
  <th>備考</th>
</tr>
</thead>
<tbody>

<!-- 行: i % 2 で背景色を #fafdff または #f0fff0 に交互配置 -->
<tr style="background-color:#fafdff;">
  <td align="center"><font color="red">NEW</font></td>
  <td align="center">札幌</td>
  <td>
    <a href="R8/be/080827-xxx.pdf" target="_blank">品名</a><br>
    <a href="R8/be/080827-yyy.pdf" target="_blank">別紙</a>
  </td>
  <td align="center">R8.9.10</td>
  <td align="center"></td>
</tr>

<tr style="background-color:#f0fff0;">
  <td align="center"><font color="red">結果</font></td>
  ...
</tr>

</tbody>
</table>

<!-- ==== インラインJavaScript ==== -->
<script>
(function(){
  var input = document.getElementById('searchInput');
  var station = document.getElementById('searchInput2');
  var table = document.getElementById('myTable');
  var descending = false;
  
  function filter(){
    // キーワード検索 + 駐屯地フィルタ実装
  }
  
  function sortDate(){
    // 入札日でソート実装
  }
  
  input.onkeyup = filter;
  station.onchange = filter;
  document.getElementById('sortDate').onclick = sortDate;
})();
</script>

</body>
</html>
```

**重要な仕様**
- ✅ CSS はすべてインライン (外部参照なし)
- ✅ JavaScript は1つの `<script>` タグ内
- ✅ CDN/外部ライブラリ依存なし
- ✅ UTF-8 自動宣言
- ✅ 交互行背景色（#fafdff ↔ #f0fff0）
- ✅ 見出しは #008b8b + 白字
- ✅ NEW/結果/区分空欄の区別表示
- ✅ 複数リンクは `<br>` で区切り
- ✅ target="_blank" でPDF開く

#### **js/csv-data.js** - CSV処理

**変換仕様**

```javascript
// Object → CSV
CsvData.toCsv([
  {ID:"1", Category:"NEW", Garrison:"札幌", ...},
  ...
], ["ID", "Category", "Garrison", ...])

// 出力:
// ID,Category,Garrison,...
// 1,NEW,札幌,...
// 2,変更,真駒内,...

// CSV → Object
CsvData.fromCsv("ID,Name\n1,A\n2,B", ["ID", "Name"])
// [{ID:"1", Name:"A"}, {ID:"2", Name:"B"}]
```

**CSV 3ファイル仕様**

|ファイル名|役割|主要列|
|-------|------|-----|
|kokoku.csv|公告マスタ|ID, Category, Garrison, BidDate, Remarks, Sort, Status|
|links.csv|PDFリンク|ID, KokokuID, Text, FileName, URL, Type, Sort|
|settings.csv|基準日|ID, Type, Text, URL, Sort（date 1行のみ）|

#### **js/zip-export.js** - ZIP生成

**実装方式**
- ZIP ヘッダをバイナリで直接構築
- File API + Blob で圧縮ファイル生成
- Base64 エンコードなし（直接バイナリ）

**ZIP 内部構造**
```
nafin/
├── R8kokoku.html       (生成HTML)
└── R8/be/
    ├── 080827-xxx.pdf  (アップロード済みPDF)
    ├── 080827-yyy.pdf
    └── ...
```

**使用方法**
```javascript
ZipExport.create([
  {name: "nafin/R8kokoku.html", content: htmlString},
  {name: "nafin/R8/be/xxx.pdf", file: File},
  ...
], function(blob){
  // blob をダウンロード
})
```

## 4. 運用・保守

### 4.1 CSVモード運用

**流れ**
1. index.html をWebサーバに配置
2. ユーザーがブラウザで開く
3. HTML取り込み → 編集 → CSV/HTML/ZIP出力
4. ダウンロードしたファイルを配布

**利点**
- サーバ側の処理なし
- データはメモリのみ
- 簡単デプロイ

**制限**
- ページ再読み込み時にデータ消失
- 複数ユーザーでの同時編集非対応

### 4.2 SharePoint モード運用

**前提条件**
- Microsoft 365 テナント
- SharePoint Online サイト
- Azure AD 認証

**設定**
```
config.txt:
DATA_MODE=SHAREPOINT
WEB_ROOT=/sites/finance
SETTINGS_LIST=kokoku_settings
ANNOUNCEMENT_LIST=kokoku
LINK_LIST=kokoku_links
PDF_LIBRARY=nafin/R8/be
```

**利点**
- クラウドストレージ
- データ永続化
- 複数ユーザー対応
- 履歴管理

### 4.2.1 必要なSharePointリストと列（2026-09-13）

以下は現在の `config/config.txt`、`js/data-service.js`、`js/sp.js` に対応する構成です。実環境のリスト作成・権限設定・接続試験は手動で実施します。記載は試験完了を意味しません。

| 対象 | 公告リスト | リンクリスト | 設定リスト | PDF保存フォルダー（設定値） |
|---|---|---|---|---|
| 物件・役務 | kokoku | kokoku_links | kokoku_settings | nafin/R8/be |
| 工事 | kouji | kouji_links | kouji_settings | nafin/R8/kouji |
| オープンカウンター | op | op_links | op_settings | nafin/R8/op |
| 公募 | kobo | kobo_links | kobo_settings | nafin/R8/kobo |

合計12リストです。公告予定・公開公告・更新依頼は同じ公告リストに保存し、`listkind` で区別します。CSVの予定用・公開用ファイルごとに別のSharePointリストを作る必要はありません。PDF本体はリスト列ではなくドキュメントライブラリ内のフォルダーに保存します。

列は以下の英小文字名で作成して内部名を確定し、その後必要なら表示名を日本語へ変更してください。追加列はすべて存在する必要がありますが、値の入力は任意（空欄可）にします。標準のタイトル列も入力必須を解除してください。アプリはタイトルを保存しません。

**4つの公告リストに共通する追加列**

| 内部名 | アプリ項目 | SharePoint列型 | 内容・値の例 |
|---|---|---|---|
| category | Category | 1行テキスト | NEW／空欄／結果 |
| garrison | Garrison | 1行テキスト | 札幌などの駐屯地名 |
| biddate | BidDate | 1行テキスト | R8.9.10（和暦文字列） |
| remarks | Remarks | 複数行テキスト（プレーンテキスト、追記なし） | 備考 |
| sort | Sort | 1行テキスト | 表示順の整数文字列（例：1） |
| status | Status | 1行テキスト | 公告登録、内容修正、公告反映済など |
| operationdate | OperationDate | 1行テキスト | 操作日時の表示用文字列 |
| listkind | ListKind | 1行テキスト | planned＝予定・依頼、published＝公開公告 |
| publicstate | PublicState | 1行テキスト | 公告掲載中／掲載終了／結果掲載中 |
| targetid | TargetID | 1行テキスト | 更新対象の元公告ID。通常公告は空欄 |
| requesttype | RequestType | 1行テキスト | 掲載終了依頼／結果登録。通常公告は空欄 |
| requeststatus | RequestStatus | 1行テキスト | 依頼の種類／公開待ち／公開済／反映確認済み |
| resulturl | ResultURL | 1行テキスト | 結果PDFの相対URL |
| resultname | ResultName | 1行テキスト | 結果PDFの元のファイル名 |
| verifiedat | VerifiedAt | 1行テキスト | HTML照合成功日時（ISO 8601） |

**4つのリンクリストに共通する追加列**

| 内部名 | アプリ項目 | SharePoint列型 | 内容 |
|---|---|---|---|
| kokokuid | KokokuID | 1行テキスト | 同じ種別の公告リストのIDを保持 |
| text | Text | 1行テキスト | 品名・PDFリンクの表示名 |
| filename | FileName | 1行テキスト | PDFファイル名 |
| url | URL | 1行テキスト | R8/be/xxx.pdf などの相対URL |
| type | Type | 1行テキスト | 公告、変更公告など |
| sort | Sort | 1行テキスト | 同じ公告内のリンク順序 |

**4つの設定リストに共通する追加列**

| 内部名 | アプリ項目 | SharePoint列型 | 内容 |
|---|---|---|---|
| type | Type | 1行テキスト | date |
| text | Text | 1行テキスト | 令和８年９月１３日現在などの基準日 |
| url | URL | 1行テキスト | 現在は未使用、空欄 |
| sort | Sort | 1行テキスト | 1 |

設定リストには基準日の行を1件登録します。

**SharePoint標準列（追加作成しない）**

| 標準列 | 型 | 使用方法 |
|---|---|---|
| ID（RESTではId） | 自動採番の整数 | 各リストの項目ID。CSVのIDをそのまま採番させるものではありません |
| 作成者（Author） | ユーザーまたはグループ | 公告の投稿者。AuthorIdとAuthor/Titleとして読み込み |
| 作成日時（Created） | 日付と時刻 | 公告の投稿日時。画面では日本時間表示 |

`AuthorId`、`AuthorName`、`Created` を同名の独自列として作成しないでください。CSVの投稿者情報と異なり、SharePointではログインユーザーと標準列を使用します。

**列型の注意点**

- 現コードは列の型に応じた保存値の自動変換を行いません。`sort`・`targetid`・`kokokuid` は数値の意味を持ちますが、現実装に合わせてテキスト列としています。数値列・参照列への変更には保存処理の対応が必要です。
- `kokokuid` は保存時に文字列へ統一します。新規公告にはSharePointが返したIDを設定し、リンクの親IDにも反映します。
- `biddate`・`operationdate`・`verifiedat` は標準Createdと異なりテキスト列です。URL列も「ハイパーリンクまたは画像」ではなくテキスト列です。
- 1行テキストの長さに収まる品名・ファイル名・URLで試験してください。長い値を扱う場合は列設計と入力制限の確認が必要です。
- 既存公告の `listkind` が空欄だと予定側へ読み込まれます。公開公告は正本のHTMLと対応を確認して `published` と公開状態を設定してください。

**接続設定**

`config/config.txt` の `DATA_MODE=SHAREPOINT` と `WEB_ROOT` に接続先サイトを指定します。`SHAREPOINT_SITE_URL` は現コードでは使用しません。DB別の `DB_..._ANNOUNCEMENT_LIST`・`LINK_LIST`・`SETTINGS_LIST` が優先されます。PDF保存先の `DB_..._PDF_LIBRARY` は実環境の既存フォルダーに合わせてください（例：`/sites/finance/nafin/R8/be`）。公開サイトの `PUBLIC_SITE_URL` とは別の設定です。接続はSharePointにログインしたブラウザーのセッションとXMLHttpRequestによるREST APIを使用します。

### 4.2.2 実環境での手動試験（未実施）

権限と以下の動作は実環境で試験します。試験結果には実施日・ブラウザーのバージョン・対象DB・期待結果・実際の結果を記録し、不一致は要修正として残してください。

| 試験項目 | 確認内容 |
|---|---|
| リスト・型・保存 | 4種類すべてで追加・修正・削除し、再読込後の公告、リンク、基準日、依頼状態を照合する。追加列の欠落・型エラーも確認する |
| 投稿者権限 | 投稿者Aは自分の投稿のみ修正・削除でき、投稿者Bの投稿はできない。SharePointリストからの直接操作でも制限されることを確認する |
| 管理者権限 | 管理者は全投稿を扱えることを確認する。現コードの管理者判定はIsSiteAdminであり、所有者グループ所属だけでは判定されない場合がある |
| 関連データの権限 | 公告だけでなくリンクリストとPDF保存先も確認する。リンク項目の作成者と公告の投稿者が異なる場合も試す |
| 保存途中の失敗 | テスト環境でPDF・リンク保存の失敗を発生させ、公告だけ残るか、警告表示、再保存による重複や孤立ファイルの有無を確認する |
| 同時更新 | 2ユーザーで同じデータを読み込んで更新し、古いETagによる更新・削除が拒否されることを確認する。ETagを取得できない場合も更新を止める |
| CSVと選択PDF | 未出力の変更・選択PDFを持った状態で再読込・一覧切替を試し、警告で中止できることを確認する。破棄して進めた場合はメモリ上の変更が失われる。CSV出力後の再取込も確認する |
| Edge 95・IE11 | 起動、一覧の幅、日付入力、PDF選択、CSV・HTML・ZIP出力、SharePoint接続を各実機で確認する |
| 公開までの一連の操作 | テストPDFを使って新規公告、掲載終了依頼、結果登録からZIP作成・展開、掲載先でのリンクとPDF内容まで確認する |

権限の詳細は [OWNERSHIP.md](OWNERSHIP.md) も参照してください。

### 4.2.3 保存処理の修正内容（2026-09-13）

ブラウザー互換性に関する通知：起動時に必要な機能を検査し、利用できない機能がある場合は画面上部の赤い「エラー通知」に対象の操作を表示します。プログラム読込失敗・未処理の実行時エラーも同じ通知欄に表示します。Edge 95・IE11という名前だけでは非対応にしません。日付入力・showPickerは代替操作があるため必須機能として扱いません。表示崩れやすべての互換性問題を自動検知するものではなく、実機試験は引き続き必要です。

- 通常の公告保存はPDF、公告、リンク、不要リンク削除の順で実行し、すべて成功した場合のみ保存完了を表示します。失敗した処理は「再保存」ボタンから再試行できます。成功済みの処理は繰り返しません。
- 公告移動はSharePoint IDを保持して `listkind` を保存します。並べ替えは各行の `sort` を保存し、再読込時にも順序を復元します。削除と基準日の保存も結果を確認します。
- SharePoint更新・削除は読込時のETagを使用します。競合時は上書きせず止めます。応答に次のETagがない場合は次回更新前に再読込が必要です。
- HTML取込はSharePointモードでも保存します。新しい公告・リンクを登録後、旧公開公告・リンクを削除します。元公告IDを参照する依頼がある場合は、参照を壊さないよう一括置換を止めます。部分失敗中は新旧項目が混在する場合があるため、再保存が完了するまで公開作業を止めてください。
- 新規公告を本リストへ移動した段階では「公開待ち」です。ZIP作成とダウンロード開始が成功した後に対象公告と依頼を公開済みにし、SharePointへ保存します。保存失敗時は未保存警告と再保存ボタンを表示します。HTML単体出力・プレビューでは公開済みにしません。公開HTML照合は公開後の一致確認です。
- ZIPのPDFバイナリ破損を修正し、ファイル読込失敗時には成功扱いにしません。
- 未保存の編集や選択PDFがある場合は、ページ離脱・DB／モード切替時に警告します。CSVとPDFをブラウザーへ永続保存する機能はありません。ブラウザーの強制終了からの復元はできません。

複数リスト・PDFの保存は単一トランザクションではありません。通信切断でサーバー処理の成否が不明になった場合は、再試行の前に実リストを確認してください。特に新規登録の応答を受け取れなかった場合は重複登録の確認が必要です。実際のダウンロード保存完了はブラウザーから取得できないため、ZIPは保存先でも確認してください。

### 4.3 拡張・カスタマイズ ポイント

**HTML テンプレート変更**
- `js/html-export.js` の `HtmlExport.create()` 内のHTML文字列を編集
- 例：カラースキーム、注意事項フォーマット

**駐屯地リスト追加/削除**
- `js/html-export.js` で駐屯地リストを動的生成
- または `index.html` の select オプションを編集

**新規フィールド追加**
- `index.html` でフォーム要素追加
- `js/app.js` でイベントハンドラ追加
- CSVスキーマ変更

**SharePoint 統合強化**
- `js/sp.js` で認証処理を追加実装
- メタデータ列、バージョン管理、通知機能など

## 5. ライセンス・著作権

Copyright © 2026 Defense Agency of Japan

## 6. 最終更新

2026年8月29日

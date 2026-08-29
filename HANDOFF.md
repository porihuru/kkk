# Codex への引き継ぎドキュメント

## プロジェクト概要

**名称**: kkk (令和8年度入札公告管理システム)  
**目的**: 北部方面隊の入札公告HTMLを、ブラウザで解析・編集・生成・配布するシステム  
**実装**: フレームワーク不使用の Vanilla JavaScript  
**デプロイ**: ブラウザのみで動作（サーバサイド処理なし）  

**HTML生成方針**: `config/koukoku.html`を原本テンプレートとし、基準日と公告行のデータだけを差し替える。デザイン、タグ構造、テンプレート内スクリプトは変更しない。  

---

## 1. 緊急事項・優先対応

### 1.1 動作確認（必須）

**本番デプロイ前に以下をテスト**

```
□ 添付ファイル「R8年度入札公告一覧.html」の取り込み
  ✓ 全駐屯地が正しく抽出される
  ✓ 複数PDFリンクが保持される
  ✓ 注意事項が正確に抽出される
  ✓ 相対URL変換が正確（R8/be/...）

□ 公告編集・保存
  ✓ 新規追加が動作
  ✓ 修正が動作
  ✓ 削除が動作
  ✓ メモリに保持される

□ HTML生成・プレビュー
  ✓ 生成HTMLが添付ファイルと同じ構造
  ✓ 色・配置が同じ（#008b8b, 交互背景色）
  ✓ ブラウザプレビューが表示

□ 出力形式
  ✓ CSV (kokoku.csv, links.csv, settings.csv)
  ✓ HTML (R8kokoku.html)
  ✓ ZIP (更新分/全データ)

□ ブラウザ互換性
  ✓ Chrome (最新)
  ✓ Firefox (最新)
  ✓ Edge (最新)
  ✓ Safari (最新版)
```

### 1.2 既知の課題

| 課題 | 状況 | 対応 |
|-----|------|-----|
| IE 11 対応 | 非対応 | Promise, Fetch が必須 |
| 並行編集 | 不可 | CSVモードはメモリのみ |
| データ永続化 | CSVモードでは保存なし | SharePoint連携で対応 |
| オフライン動作 | 不可 | HTML取り込みのみ可能 |

---

## 2. コード構造と重要な関数

### 2.1 app.js（700行）- メインエンジン

**状態管理（グローバル変数）**
```javascript
allAnnouncements  // 公告配列 [{ID, Category, Garrison, BidDate, Remarks, Sort, Status}]
allLinks          // PDFリンク配列 [{ID, KokokuID, Text, FileName, URL, Type, Sort}]
allSettings       // 設定配列 [{ID, Type, Text, URL, Sort}]
selectedPdfFiles  // アップロード済みPDF {linkID: File}
dateSortDescending // ソート方向フラグ
```

**主要関数**
```javascript
render(announcements)           // UI表にデータを描画
saveAnnouncement(event)         // 公告の保存/更新
deleteAnnouncement()            // 公告削除
filterAnnouncements()           // キーワード検索＋フィルタ
exportCsv/Html/Zip()            // 各形式で出力
importSource()                  // HTML取り込み実行
replaceImportedData(data)       // 取り込み結果をメモリに反映
```

**処理フロー**
```
ユーザー入力
  ↓
イベントハンドラ (onclick, onsubmit)
  ↓
処理関数 (save/delete/filter/export)
  ↓
メモリ配列更新
  ↓
(SharePoint連携時) DataService.add/update/remove() 呼び出し
  ↓
render() で UI再描画
```

### 2.2 html-import.js（120行）- HTML解析

**メインAPI**
```javascript
HtmlImport.parse(htmlSource) → {announcements, links, settings}
HtmlImport.readFile(file, success, error)
```

**解析ロジック**
```
1. HTMLを DOM にパース
2. 第1テーブル (tables[0]) の右側セル th[1] から注意事項抽出
   - <br> で分割
   - <a> は link type に分類
3. 公告テーブル (rows[1:]) をスキャン
   - セル0: Category (区分)
   - セル1: Garrison (駐屯地)
   - セル2: PDFリンク (複数 <a> 対応)
   - セル3: BidDate (入札日)
   - セル4: Remarks (備考)
4. リンク URL を相対化（/nafin/R8/ → R8/be/...）
5. ファイル名を URL から抽出
```

**重要な変換ルール**
```javascript
relativeUrl(url)
  // "https://www.mod.go.jp/gsdf/nae/fin/nafin/R8/be/xxx.pdf"
  // → "R8/be/xxx.pdf"

fileName(url)
  // "https://www.mod.go.jp/.../R8/be/080827-xxx.pdf"
  // → "080827-xxx.pdf"
```

### 2.3 html-export.js（150行）- HTML生成

**メインAPI**
```javascript
HtmlExport.create(announcements, links, settings) → HTMLドキュメント文字列
HtmlExport.openPreview(announcements, links, settings) → ブラウザ新窓表示
```

**生成するHTML構造**
```
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>/* インラインスタイル */</style>
  </head>
  <body>
    <!-- 1段目テーブル：タイトル＋注意事項 -->
    <!-- 2段目テーブル：検索UI -->
    <!-- 3段目テーブル：公告データ (#008b8b ヘッダ) -->
    <script>/* 検索・ソート機能 */</script>
  </body>
</html>
```

**重要なポイント**
- ✅ CSS はすべてインライン
- ✅ JavaScript は1つの `<script>` タグ内に
- ✅ 外部ライブラリ依存なし
- ✅ 元のHTML構造に完全準拠
- ✅ 交互行背景色（#fafdff ↔ #f0fff0）

### 2.4 csv-data.js（50行）- CSV処理

**API**
```javascript
CsvData.toCsv(data, columns)    // 配列 → CSV文字列
CsvData.fromCsv(csvText, columns) // CSV文字列 → 配列
```

**CSV ファイルスキーマ**

| ファイル | 用途 | 列 |
|---------|------|-----|
| kokoku.csv | 公告マスタ | ID, Category, Garrison, BidDate, Remarks, Sort, Status |
| links.csv | PDFリンク | ID, KokokuID, Text, FileName, URL, Type, Sort |
| settings.csv | 基準日 | ID, Type, Text, URL, Sort（date 1行のみ） |

### 2.5 zip-export.js（100行）- ZIP生成

**API**
```javascript
ZipExport.create(files, success)
  // files: [{name: "path/name", content: "text"} or {name: "...", file: File}]
```

**ZIP内構造例**
```
nafin/
├── R8kokoku.html
└── R8/be/
    ├── 080827-xxx.pdf
    ├── 080827-yyy.pdf
```

### 2.6 data-service.js & sp.js（合計130行）- 永続化層

**動作モード**
- **CSVモード**（デフォルト）: メモリのみ、手動DL
- **SharePointモード**: REST API で自動保存

**API**
```javascript
DataService.isSharePoint()       // モード判定
DataService.add(list, item)      // アイテム追加
DataService.update(list, id, item) // アイテム更新
DataService.remove(list, id)     // アイテム削除
DataService.uploadPdf(file, name) // PDF アップロード
```

---

## 3. 設定・カスタマイズ

### 3.1 config.txt

```
# 運用モード
DATA_MODE=CSV              # CSV または SHAREPOINT

# SharePoint 連携（SharePoint モード時）
SHAREPOINT_SITE_URL=https://tenant.sharepoint.com/sites/...
SETTINGS_LIST=kokoku_settings
ANNOUNCEMENT_LIST=kokoku
LINK_LIST=kokoku_links
HTML_FILE=R8kokoku.html
PUBLIC_ROOT=nafin
PDF_ROOT=nafin/R8/be
PDF_LIBRARY=nafin/R8/be
```

### 3.2 HTMLテンプレート変更

**変更箇所**: `js/html-export.js` の `HtmlExport.create()` 内

```javascript
// 例：タイトル色を変更
var title = "令和8年度<span style=\"color:red;\">入札公告</span>一覧";
//                                    ↓ 変更可

// 例：注意事項の格式を変更
settingHtml.push("<p>■ " + escapeHtml(settings[i].Text) + "</p>");
//                       ↓ 格式変更
```

### 3.3 駐屯地リスト変更

**変更箇所**: `js/html-export.js` で駐屯地リストを生成

```javascript
function garrisons(announcements) {
  // 公告から一意な駐屯地を抽出
  // セレクトボックスに動的生成
}
```

### 3.4 新フィールド追加

**手順**
1. `index.html` でフォーム要素追加
   ```html
   <label>新フィールド</label>
   <input id="new-field-input" type="text">
   ```

2. `app.js` でイベントハンドラ追加
   ```javascript
   announcement.NewField = byId("new-field-input").value;
   ```

3. `csv-data.js` の columns に追加
   ```javascript
   ["ID", "Category", "Garrison", ..., "NewField"]
   ```

4. `html-export.js` で表示（必要に応じ）

---

## 4. テスト戦略

### 4.1 単体テスト（推奨）

```javascript
// html-import.js のテスト
const testHtml = `<html>...</html>`;
const result = HtmlImport.parse(testHtml);
console.assert(result.announcements.length > 0);

// csv-data.js のテスト
const csv = CsvData.toCsv([{ID:"1", Name:"A"}], ["ID", "Name"]);
console.assert(csv.includes("ID,Name"));
```

### 4.2 統合テスト

1. **HTML取り込みテスト**
   - 実ファイル「R8年度入札公告一覧.html」を取り込み
   - 駐屯地数、公告数が正確か確認
   - リンク数が正確か確認

2. **編集テスト**
   - 公告追加 → メモリに反映されるか
   - 公告修正 → 既存値が上書きされるか
   - 公告削除 → リンクも一緒に削除されるか

3. **出力テスト**
   - CSV → Excel で開いて確認
   - HTML → 全ブラウザで表示確認
   - ZIP → 展開して内容確認

### 4.3 ブラウザテスト

```
Chrome 最新
  ✓ HTML取り込み
  ✓ 編集・保存
  ✓ CSV出力
  ✓ HTML プレビュー
  ✓ ZIP ダウンロード

Firefox 最新
  [同上]

Edge 最新
  [同上]

Safari 最新
  [同上]

IE 11
  ✗ Promise/Fetch 非対応
  → Polyfill 追加が必要
```

---

## 5. デプロイ手順

### 5.1 CSVモード（クイックスタート）

```
1. WebServer に配置
   /var/www/html/kkk/
     ├── index.html
     ├── css/style.css
     ├── js/*.js
     ├── csv/ (サンプル)
     └── config/

2. ブラウザで開く
   http://localhost/kkk/index.html

3. テスト
   - HTML取り込み
   - 公告編集
   - CSV/HTML/ZIP出力
```

### 5.2 SharePointモード（本番環境）

```
1. SharePoint サイト準備
   - 「kokoku_settings」リスト作成
   - 「kokoku」リスト作成
   - 「kokoku_links」リスト作成
   - 「nafin」ドキュメント ライブラリ

2. config.txt を設定
   DATA_MODE=SHAREPOINT
   SHAREPOINT_SITE_URL=https://...

3. js/sp.js で認証設定
   - Azure AD アプリケーション登録
   - クライアント ID, テナント ID

4. テスト実行
   - CRUD 操作が動作するか
   - PDF アップロード が動作するか
```

---

## 6. トラブルシューティング

### 問題: HTML取り込み失敗

**原因と対策**
```
❌ HTMLファイルが R8 テンプレートと異なる
   → テンプレート構造を確認（1段目テーブルが必須）

❌ 文字コードが UTF-8 でない
   → ファイルを UTF-8 で変換

❌ ブラウザコンソールにエラー
   → F12 → Console でエラーメッセージ確認
   → html-import.js の正規表現を確認
```

### 問題: ZIP ダウンロード失敗

**原因と対策**
```
❌ PDFファイルをアップロードしていない
   → アップロード入力でファイル選択

❌ ブラウザのポップアップブロック
   → ポップアップを許可

❌ ファイルサイズが大きすぎる
   → ブラウザのメモリ限界（通常 256MB）
   → 分割ダウンロード検討
```

### 問題: SharePoint 連携失敗

**原因と対策**
```
❌ 認証トークンが取得されない
   → Azure AD 設定を確認
   → クライアント ID, テナント ID を確認

❌ リストへの書き込みに失敗
   → SharePoint 権限確認
   → リスト列の型を確認（テキスト/複数行テキスト）

❌ PDF アップロード失敗
   → ドキュメント ライブラリの権限確認
   → ファイルサイズを確認
```

---

## 7. メンテナンス・拡張

### 7.1 定期チェック項目

```
□ 月1回: HTMLテンプレート変更への対応
  - 新年度では新テンプレートが出されることを想定
  - html-import.js の解析ルール確認

□ 四半期ごと: ブラウザ互換性確認
  - 新版ブラウザでテスト
  - Polyfill の必要性確認

□ 年1回: SharePoint API の最新版確認
  - MS のサポート終了予定を確認
  - 認証方式の更新確認
```

### 7.2 今後の拡張案

```
優先度 高
- [ ] ローカルストレージ対応（オフライン編集）
- [ ] 複数言語対応（英語など）
- [ ] バッチ操作（複数公告の一括編集）

優先度 中
- [ ] 監査ログ・バージョン管理
- [ ] メール通知
- [ ] 権限管理

優先度 低
- [ ] ダークモード
- [ ] UI フレームワーク化（React など）
- [ ] モバイル アプリ化
```

---

## 8. サポート体制

### 連絡先

```
北部方面会計隊本部
- 財務管理官: [連絡先]
- 問い合わせ: [メール/電話]

開発者 (引き継ぎ時点)
- [名前]: [連絡先]
```

### よくある質問（FAQ）

```
Q: データはどこに保存されますか？
A: CSVモード → ブラウザのメモリのみ（再起動で消失）
   SharePointモード → SharePoint Online（永続）

Q: オフラインで使えますか？
A: 部分的に可能（HTML取り込みは可能）
   ただし、出力・配布はネット接続が必須

Q: 複数ユーザーで同時編集できますか？
A: CSVモード → 不可（競合回避なし）
   SharePointモード → 可能（ただし最新版が上書き）

Q: 大量の公告を取り込んでも大丈夫ですか？
A: ブラウザのメモリに依存（通常 1000件まで可能）
   それ以上は分割推奨
```

---

**ドキュメント作成日**: 2026年8月29日  
**最終更新**: 2026年8月29日  
**Codex へのハンドオフ版**

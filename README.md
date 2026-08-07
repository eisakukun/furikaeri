# ふりかえり記録アプリ

やったことをボタンでパパッと記録して、あとから週単位で眺めるだけのアプリ。
**過去だけ**を扱い、予定・ToDo・達成率・評価は一切なし。事実を並べるだけ。

- データは端末の **localStorage** と **Googleカレンダー** の両方に保存（オフラインでも入力可能）
- 起動時と「Googleカレンダーから更新」ボタンで、カレンダーに残る過去の記録を端末へ復元
- じぶんカレンダーと同じ土台：保存キー `jibun-furikaeri`／GASは no-cors 方式
  （※同じオリジン=localhost で開けば、将来カレンダーのマネージャーが `jibun-furikaeri` を読んでまとめられます）

## 成果物
- `index.html` … アプリ本体（1ファイル完結）
- `manifest.json` / `icon.svg` … PWA用
- `sw.js` … Service Worker（オフライン）
- `Code.gs` … GAS（Googleカレンダーへの書き込み・読み込み・削除）

---

## 1. ローカルで動かす（Mac）
```bash
cd ~/furikaeri
python3 -m http.server 8788
```
ブラウザで **http://localhost:8788/** を開く。

- Service Worker は **http://localhost か HTTPS でのみ動く**（`file://` だとPWA/オフラインは無効）
- ※ じぶんカレンダー等と同じ `localhost:8787` の土台で開きたい場合は、`~/furikaeri` をホーム直下に置いたまま
  `http://localhost:8787/furikaeri/` で開けば同一オリジンになり、将来の連携がしやすいです。

## 2. Googleカレンダー連携（GAS）
1. **script.google.com** → 新しいプロジェクト
2. `Code.gs` の中身を貼り付けて保存
3. 「デプロイ」→「新しいデプロイ」→ 種類=**ウェブアプリ**
   - 実行するユーザー：**自分**
   - アクセスできるユーザー：**全員**
4. 初回は権限を承認（カレンダーへのアクセス）
5. 出てきた **ウェブアプリURL**（`…/exec`）をコピー
6. アプリの **⚙️設定** に貼り付けて保存 →「疎通テスト」でGoogleカレンダーに「疎通テスト」が入ればOK
7. `Code.gs` を更新したときは「デプロイを管理」→鉛筆→バージョンを「新バージョン」にして再デプロイ

### CORSについて（コード内コメントにも記載）
GASのWebアプリはCORSプリフライトを通せないため、フロントは
`fetch(url, { mode:'no-cors', headers:{'Content-Type':'text/plain'} })` で送信。
GAS側は `e.postData.contents` を `JSON.parse` して受け取る。
書き込みはno-corsで行います。読み込みは `<script>` で受け取れるJSONP方式を使い、説明欄に `[fk:記録ID]` がある、このアプリ由来の予定だけを復元します。

## 3. iPhoneで使う
記録データはブラウザ(端末)ごとに別。iPhoneで使うには次のどちらか：

**A) 同じWi-Fiのパソコン経由（お試し向け）**
- Macで `python3 -m http.server 8788 --bind 0.0.0.0` を実行
- iPhoneのSafariで `http://<MacのIP>:8788/` を開く（IPは システム設定→Wi-Fi で確認）
- ※ この場合URLが `http://` なので **Service Worker(PWA/オフライン)は動きません**

**B) HTTPSにホスティング（ホーム画面アプリとして使うなら必須）**
- GitHub Pages / Netlify / Cloudflare Pages 等にこのフォルダを置く（無料）
- iPhoneのSafariでそのHTTPS URLを開く → 共有 → **「ホーム画面に追加」**
- **PWAとしてアプリのように起動**でき、オフラインでも動きます
- ⚠️ **Service Worker は HTTPS か localhost でしか動かない**ため、iPhoneでPWA化するにはHTTPSホスティングが必要です

## メモ
- カテゴリ：仕事 / 好きな仕事 / 研究・プログラミング / ダンス / 出会い / 人と会う・イベント / 生活・その他
- 複数カテゴリ選択OK（例：友達と会って研究して仕事になった → 3つ選択）。振り返りでは各カテゴリに重複カウント（偏りを見る用）
- GAS同期の重複防止：説明欄に `[fk:記録ID]` を埋めて同一記録を更新

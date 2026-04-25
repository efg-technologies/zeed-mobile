# Apple App Privacy — 質問票回答 (Zeed Mobile)

App Store Connect の "App Privacy" タブで、Apple は data collection
種別ごとに「使用目的」「ユーザーに紐付くか」「トラッキング目的か」を
質問してくる。Zeed の Tier A telemetry allowlist に基づいた回答を
ここに固定する。

最新更新: 2026-04-25

---

## サマリ

| 種別 | 答え |
|---|---|
| Data Collected | **Yes** (但し anonymous + opt-in のみ) |
| Data Used to Track You | **No** |
| Data Linked to You | **No** |
| Data Not Linked to You | **Yes** (Diagnostics + Usage Data) |

---

## 個別カテゴリ回答

### Contact Info — Email / Phone / Name / Address / Other

**Collect**: No

### Health & Fitness

**Collect**: No

### Financial Info — Payment / Credit / Other

**Collect**: No (BYO OpenRouter key — Zeed は支払い経路に介在しない)

### Location — Precise / Coarse

**Collect**: No

### Sensitive Info

**Collect**: No

### Contacts

**Collect**: No

### User Content — Photos / Videos / Audio / Gameplay / Customer Support / Other

**Collect**: No
- Memory・Bookmarks・Tasks・Chat 履歴・Context Map はすべて端末ローカル
- support@efg-technologies.com は Apple 経由でなく利用者が直接送るため
  "Customer Support" として申告不要 (Apple ガイドラインの "通常の双方向
  メールやり取り" に該当)

### Browsing History

**Collect**: No
- 閲覧 URL は telemetry allowlist の deny list にあり、絶対に送信しない
- `no_personal_data.test.ts` でリリース毎に backstop

### Search History

**Collect**: No (検索ボックスへの入力は端末内 history のみ)

### Identifiers

- **User ID** (account ID, login name 等): No
- **Device ID** (Apple IDFA): No
- **Other Identifier** (`install_id` UUID v4): **Yes**, but:
  - 完全 anonymous (random per install)
  - 端末リセット / 再 install で破棄
  - User account との紐付けなし

### Purchases

**Collect**: No (アプリ内課金なし、購読なし)

### Usage Data

- **Product Interaction** (Tier A の `feature_used`, `agent_run`):
  **Yes**, **Not linked to user**, **Not used for tracking**
- **Advertising Data**: No
- **Other Usage Data**: No

### Diagnostics

- **Crash Data** (Tier A の `crash`): **Yes**, **Not linked**, **Not tracking**
- **Performance Data**: No
- **Other Diagnostic Data** (Tier A の `session_start`, `heartbeat`,
  `install`): **Yes**, **Not linked**, **Not tracking**

### Other Data Types

**Collect**: No

---

## Tracking 質問

> Do you or your third-party partners use data from your app to track users?

**No**

理由:
- Apple IDFA を取得しない
- 第三者 SDK を使わない (Tier A telemetry の宛先は自社 Cloudflare Worker のみ)
- ATT (App Tracking Transparency) プロンプトは表示しない
- Cross-app / Cross-website tracking 一切なし

`app.json` の Info.plist には `NSUserTrackingUsageDescription` を含めない
(必要時に追加する設計だが現状不要)。

---

## 記述根拠

- Tier A telemetry allowlist: `lab/plans/orion/telemetry.spec.md`
- 実装側 deny-list backstop: `src/telemetry/no_personal_data.test.ts`
- LP プライバシーポリシー: `https://zeed.run/privacy` (mobile telemetry も
  同一文書で扱う — section 2 / 3 が Mobile も含む)

---

## 変更履歴

| 日付 | 変更 |
|---|---|
| 2026-04-25 | 初版 (Tier A allowlist 確定後の状態) |

# App Store Connect — メタデータ草案 (Zeed Mobile)

D-U-N-S 取得 → Apple Developer Program 加入 → App Store Connect で
新規アプリ作成 → 以下のフィールドにコピペする。

文字数制限は Apple の最新仕様 (2026-04 時点)。日英の両方を用意 (Apple の
ローカライズで「日本」と「English (U.S.)」を有効化)。

---

## アプリ情報 (App Information)

| 項目 | 値 |
|---|---|
| Bundle ID | `com.efgtechnologies.zeedmobile` (`app.json` と一致) |
| SKU | `zeed-mobile-ios-001` |
| Primary language | English (U.S.) |
| Localizations | English (U.S.) / Japanese |
| Category — Primary | Productivity |
| Category — Secondary | Utilities |
| Content Rights | Does NOT contain third-party content (BYO LLM key で外部はユーザー契約) |
| Age Rating | 4+ (no objectionable content built-in。WebView 経由の閲覧コンテンツは規約で個別責任) |

---

## 価格と配信 (Pricing and Availability)

| 項目 | 値 |
|---|---|
| Price | Free |
| Availability | All territories (Phase 5 では制限なし) |
| Pre-order | No |
| App Distribution Methods | App Store + TestFlight |

---

## App Privacy (App Privacy / Data Collection)

詳細別紙: `docs/app-privacy.md`

要約:
- **Data linked to user**: なし
- **Data not linked to user**: Diagnostics (crash logs, performance), Usage Data (product interaction)
- **Tracking**: なし (App Tracking Transparency プロンプト不要)

---

## Version Information (バージョン公開ごとに更新)

### App Name (30 char max)

- **EN**: `Zeed — Think with you AI`  (24)
- **JA**: `Zeed — 考える AI ブラウザ`  (16)

### Subtitle (30 char max)

- **EN**: `BYO key, on-device memory`  (25)
- **JA**: `自分の鍵、端末で記憶`  (10)

### Promotional Text (170 char max、変更に審査不要)

- **EN**:
  ```
  An AI browser that thinks with you. Bring your own OpenRouter key.
  Memory, bookmarks, history stay on your device. 300+ LLMs, no lock-in.
  ```
  (151)
- **JA**:
  ```
  あなたと一緒に考える AI ブラウザ。OpenRouter の鍵を持ち込み、記憶・
  ブックマーク・履歴は端末から出ない。300 以上の LLM から選べる。
  ```
  (90)

### Description (4000 char max)

- **EN**: → `app-store-description.en.md`
- **JA**: → `app-store-description.ja.md`

(別ファイルで管理。主張の重複を避けるため、本 doc では概要のみ)

### Keywords (100 char max、カンマ区切り、language ごと)

- **EN**: `ai,browser,llm,openrouter,gpt,claude,chatgpt,memory,agent,private,bookmark,tab,research`  (89)
- **JA**: `AI,ブラウザ,LLM,OpenRouter,GPT,Claude,記憶,エージェント,検索,タブ,プライベート`  (66)

### Support URL

`https://zeed.run/`  (LP 内 install + mailto support)

### Marketing URL

`https://zeed.run/`

### Privacy Policy URL

`https://zeed.run/privacy`

### Copyright

`© 2026 EFG Technologies Inc.`

---

## Build Information

### Export Compliance

- **Uses encryption**: Yes
- **Exempt from export compliance**: **Yes** (uses only standard iOS encryption — TLS / Keychain APIs)
- `app.json` 上で `ios.config.usesNonExemptEncryption: false` を明示

### TestFlight Beta App Description (4000 char max)

```
Zeed Mobile is a privacy-first AI browser. Beta highlights:

- Bring your own OpenRouter API key (300+ LLMs, no lock-in)
- Memory, bookmarks, recent tabs stay on the device
- Agent loop reads the current page and acts on your behalf — sensitive
  actions always pause for confirmation
- Private profile is fully zero-trace (no memory, no telemetry)
- Markdown + zeed-graph rendering for chat replies

What's not yet in:
- Cloud Autopilot (Path B) — opt-in, off by default
- Sync between devices (Phase 6)
- Scheduled tasks ("cron")

What we'd love feedback on:
- Where the agent loop gets stuck (SPA pages, login walls)
- Auto vs Ask vs Search mode discoverability
- Battery / memory impact during long sessions
- Anything that feels slow

Thanks for trying! → support@efg-technologies.com
```

### TestFlight Beta App Review Information

| 項目 | 値 |
|---|---|
| Sign-In Information | not required (BYO key) |
| Demo Account | n/a |
| Notes | → `docs/testflight-review-notes.md` を貼る |
| Contact First Name | (user) |
| Contact Last Name | (user) |
| Contact Phone | (user) |
| Contact Email | `support@efg-technologies.com` |

---

## Screenshots (User 撮影 — 該当端末で実機 or Simulator)

| デバイス | 解像度 | 必要枚数 |
|---|---|---|
| 6.9" iPhone Pro Max | 1320 × 2868 | 3-10 枚 (推奨 5) |
| 6.5" iPhone Plus | 1284 × 2778 | 3-10 枚 (推奨 5) |
| iPad Pro 13" (M4) | 2064 × 2752 | 3-10 枚 (Tablet 対応するなら、`supportsTablet: true` 既に有効) |

撮影シナリオ (council 2026-04-22 の heavy_user persona に寄せる):

1. **Hero**: Auto モードで chat 中、回答が markdown + zeed-graph で描画
2. **Tabs**: Profile > TabGroup の階層が見える状態
3. **Agent run**: Agent が実行中、step 進行が見える
4. **Private profile**: バナー表示、AI 機能 off の説明
5. **Settings**: BYO key 入力画面 (key はマスク or ダミー)

各言語ごとに撮影必須ではないが、UI が大きく違うなら EN / JA 両方推奨。

---

## App Icon (Apple 仕様)

- **App Store icon**: 1024 × 1024 PNG, no transparency, no rounded corners (Apple がマスク適用)
- 現状 `assets/icon.png` は 1024×1024。Origami Z (rx 10 はキャンバス内、外側 OS が round-corner マスクを適用するため要回避)
- iOS 18+ Tinted icon (Light / Dark / Tinted) — Liquid Glass / icon variants 対応するなら別途 1024×1024 を 3 枚

---

## App Store Connect 入力チェックリスト (発射前)

- [ ] Bundle ID 確認 (`app.json` と一致)
- [ ] EN / JA ローカライズ有効
- [ ] App Icon (1024×1024) アップロード
- [ ] Description / Subtitle / Promotional Text / Keywords (EN/JA)
- [ ] Privacy Policy URL = `https://zeed.run/privacy`
- [ ] Support URL = `https://zeed.run`
- [ ] App Privacy 質問票 — `app-privacy.md` の答えを反映
- [ ] Export Compliance — Exempt で No
- [ ] Categories — Productivity / Utilities
- [ ] Age Rating — 4+
- [ ] TestFlight Beta App Description 入力
- [ ] TestFlight Review Notes 貼り付け
- [ ] Screenshots (3+ サイズ) アップロード
- [ ] Build をアップロード (EAS Build or Xcode Archive)

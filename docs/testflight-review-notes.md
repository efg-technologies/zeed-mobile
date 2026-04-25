# TestFlight / App Store Review — Reviewer Notes

App Store Connect の "App Review Information" → "Notes" にコピペする。
Apple のレビュアー (人間) が初回審査で読む欄。BYO LLM キーの説明と、
動作確認手順をここに集約する。

---

## English (default — paste this verbatim)

```
Hi reviewer,

Zeed is a privacy-first AI browser. Two things to know up front:

1. BRING YOUR OWN KEY (BYO)

   The AI features require an OpenRouter API key supplied by the
   user. Without it, the chat / agent UI shows an "API key needed"
   prompt and links the user to https://openrouter.ai to create one
   (free tier exists). The browser itself works without a key.

   For review, we recommend creating a free OpenRouter account and
   entering any minor-credit key (~$1 is more than enough). The app
   stores the key in iOS Keychain only. Zeed servers do not see it.

2. NO MANAGED ACCOUNT, NO SIGN-IN

   There is no Zeed account, no sign-in screen, no user profile on
   our servers. The app talks directly to OpenRouter for chat and
   to public RSS / web pages for browsing. Telemetry is opt-in and
   limited to anonymous diagnostics; it is OFF by default.

WHAT TO TEST

- Open the app → tap the URL bar → search "openrouter pricing".
  In Auto mode, Zeed will pick a fast model and answer.
- Switch to Ask mode (the segmented control above the input).
  Type a question. The reply renders with Markdown.
- Open https://example.com → tap the AI icon → ask "summarise this
  page". The agent reads the active tab.
- Switch to Private profile (top-right). The AI is disabled and
  no telemetry is sent. Browsing leaves no trace on close.

PRIVACY POSTURE

- Browsing URLs, page contents, chat contents are NEVER transmitted
  to Zeed servers. Anonymous opt-in telemetry is two events only
  (crash, agent_run outcome).
- Full policy: https://zeed.run/privacy

EXPORT COMPLIANCE

The app uses only standard iOS encryption (TLS, Keychain APIs) and
qualifies for the export compliance exemption.
ITSAppUsesNonExemptEncryption is declared as false in the bundle.

CONTACT

support@efg-technologies.com — average response < 48h on weekdays.

Thank you!
```

---

## Japanese (Apple ローカライズが ja の時に上書き)

```
レビュアー各位、お世話になります。

Zeed はプライバシー優先の AI ブラウザです。最初に 2 点ご共有します。

1. BYO 鍵 (Bring Your Own)

   AI 機能はユーザー自身の OpenRouter API key で動作します。鍵が
   無いとチャット / Agent UI に「API key needed」が出て、
   https://openrouter.ai に誘導されます (無料枠あり)。ブラウザと
   しての機能は鍵なしでも動きます。

   審査用には、無料の OpenRouter アカウントで少額 (~$1) チャージ
   した key を作って入力していただければ十分です。鍵は iOS
   Keychain に保存され、Zeed サーバには送信されません。

2. アカウント不要・サインイン不要

   Zeed アカウントはありません。サインイン画面もユーザーマイ
   ページもありません。アプリは OpenRouter (チャット / Agent)・
   RSS や Web ページ (閲覧) と直接通信します。テレメトリは
   オプトインかつ匿名 2 イベントのみ、初期状態 OFF です。

確認シナリオ

- アプリを開いて URL バー → "openrouter pricing" を検索。
  Auto モードで高速モデルが回答します。
- Ask モードに切替 (入力欄上のセグメント) → 質問を入力。
  Markdown で表示されます。
- https://example.com を開く → 右下 AI アイコン → 「このページを
  要約して」と依頼。Agent が現在のタブを読みます。
- 右上のプライベートに切替。AI は停止し、テレメトリも止まります。
  閉じた瞬間にセッションは消えます。

プライバシー姿勢

- 閲覧 URL、ページ内容、チャット内容は Zeed サーバには絶対に
  送信されません。オプトインで送られる匿名イベントは crash と
  agent_run の 2 種類のみです。
- 詳細: https://zeed.run/privacy

輸出コンプライアンス

iOS 標準の暗号 (TLS、Keychain API) のみ使用しており、輸出規制
適用免除に該当します。ITSAppUsesNonExemptEncryption は false
です。

連絡先

support@efg-technologies.com (営業日 48 時間以内に返信)

よろしくお願いします。
```

---

## 想定 reject 対応 (preempt)

過去事例から Apple がよく指摘するポイントとそれに対する一次回答:

| 想定指摘 | 一次回答 |
|---|---|
| "App requires sign-in / account but no demo" | サインイン不要。BYO OpenRouter key だけで動く。Notes に key 取得手順を書いた |
| "App relies on third-party tools / has minimal functionality" | Zeed は Chromium 同等のフル機能 Web ブラウザ。AI は付加機能であり、鍵なしでもブラウザとして動く (URL バー入力で google 検索や RSS 閲覧が可能) |
| "Privacy URL not loading" | `https://zeed.run/privacy` は live で 200。CF Pages 配信 |
| "Camera / Location permission requested but unused" | Info.plist の `NSCameraUsageDescription` / `NSLocationWhenInUseUsageDescription` は WebView の getUserMedia / Geolocation 要求時にユーザーに表示する標準テキスト。アプリ自身は要求しない |
| "App Tracking Transparency missing" | ATT 不要 (IDFA を取得しないため)。`NSUserTrackingUsageDescription` を Info.plist から削除 |
| "Mention of competitors / app names" | App Store description に Apple Safari や Chrome の名前を出さない (現草案 OK) |

---

## 変更履歴

| 日付 | 変更 |
|---|---|
| 2026-04-25 | 初版 |

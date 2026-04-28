# TestFlight 配信ランブック

D-U-N-S 取得 → Apple Developer Program 加入完了の翌日に走らせる手順。
**所要時間**: 90 分 (Build 待ち含む)。**コスト**: $99/yr (Apple Developer)。

すべての文言・スクリーンショットの素材は `docs/app-store-metadata.md`
等に揃っているので、**コピペで進む** 構成。

---

## 0. 前提

- [ ] D-U-N-S 番号が手元にある
- [ ] Apple Developer Program に EFG Technologies Inc. として加入済 ($99 払済)
- [ ] App Store Connect に Admin としてサインインできる
- [ ] EAS CLI がインストール済 (`npm i -g eas-cli`、`eas login`)
- [ ] `expo` CLI も最新 (`npm i -g expo-cli` は不要、`npx expo` で足りる)

---

## 1. App Store Connect で App を作成

1. App Store Connect → Apps → +
2. Bundle ID `com.efgtechnologies.zeedmobile` を選択
3. SKU `zeed-mobile-ios-001`、Primary language English (U.S.)
4. App Name: 仮入力 (`Zeed — Think with you AI`、後で更新可)
5. 作成後 "App Information" タブで:
   - Localizations 追加: Japanese
   - Categories: Productivity / Utilities
   - Content Rights: No third-party content
   - Age Rating: 4+

## 2. EAS プロジェクト紐付け

```sh
cd zeed-mobile
eas init                                  # プロジェクト ID 発行
eas credentials                           # 証明書 + プロビジョニング自動生成
```

`extra.eas.projectId` が `app.json` に書き込まれる (空文字を置き換え)。

## 3. iOS Build を出す

### 3a. 自動化 path (推奨)

EXPO_TOKEN を 1Password に保存しておくと、対話なしで build → submit まで一発で走る。

前提:
- 1Password に `Expo zeed-ci EXPO_TOKEN` を Password category で保存済
- `eval $(op signin)` 済 (1Password CLI サインイン)

```sh
./scripts/eas-build.sh release production    # build → TestFlight 自動 submit
./scripts/eas-build.sh build development     # 実機 sideload 用 dev client
./scripts/eas-build.sh build preview         # internal distribution
```

詳細は `scripts/eas-build.sh` のヘッダ参照。

### 3b. 手動 path (fallback)

```sh
eas build --platform ios --profile production
```

15-25 分。完了すると EAS Dashboard に `.ipa` が出る。
通知メールから直接 App Store Connect に投げる (`eas submit` でも OK):

```sh
eas submit --platform ios --latest
```

## 4. Build を TestFlight に登録

App Store Connect → TestFlight タブ:

1. Build がここに 5-10 分後に Processing → Ready で出てくる
2. "Test Information" を埋める:
   - Beta App Description: `docs/app-store-metadata.md` の TestFlight Beta App Description セクション
   - Beta App Review Information: `docs/testflight-review-notes.md` の English を貼り付け
   - Sign-In Information: 不要
3. "Internal Testing" グループを作成 (最大 100 名、審査なし、Internal User のみ追加可):
   - グループ名: "Zeed Internal"
   - 自分を追加 → invite メール → TestFlight アプリで accept
4. Internal で動作確認できたら "External Testing" グループ作成 (Apple 審査あり、24-48h、最大 10000 名):
   - グループ名: "Zeed Beta"
   - 公開 link を生成 (link 知っているだけで Internal/External 関係なく入れる、ただし枠は External)

## 5. App Store Connect の "App Privacy" を埋める

`docs/app-privacy.md` の「個別カテゴリ回答」を質問票にコピペ。

回答後、"Publish" を押すまでは内部のみで保存される。Publish 後は
ユーザーに見えるカード化される。

## 6. 公開申請 (App Store Review、外部リリース時のみ)

TestFlight では不要。本リリース時に下記を実行:

1. App Store Connect → App → "iOS App" タブ → 1.0 Version (Prepare for Submission)
2. メタデータ入力:
   - Description: `docs/app-store-description.en.md` の本文 / `docs/app-store-description.ja.md`
   - Keywords: `docs/app-store-metadata.md` 参照
   - Promotional Text: 同上
   - Subtitle: 同上
   - Privacy Policy URL: `https://zeed.run/privacy`
   - Support URL: `https://zeed.run`
3. App Review Information:
   - Notes: `docs/testflight-review-notes.md` の English を貼る
   - Contact: support@efg-technologies.com
4. Build を選択 (TestFlight に上がっているもの)
5. Screenshots を 6.9" / 6.5" / iPad Pro 13" 各 5 枚以上
6. "Submit for Review"

審査 24-48h、approve → "Manual release" 設定なら user 操作で公開。

---

## トラブルシューティング

### Build が EAS で失敗する
- `npx expo doctor` でローカル整合性チェック
- `eas build:list` で最新ログを確認
- よくあるのは `bundleIdentifier` 競合 (Apple Developer の App ID と
  齟齬) → `eas credentials` で再生成

### App Store Connect で "Invalid Provisioning Profile"
- `eas credentials` → "Remove" → 再生成
- App Identifier 側で Capabilities (Web Browser entitlement) が ON か確認

### TestFlight Internal で "Build is invalid"
- `usesNonExemptEncryption` 周りが多い。`app.json` の
  `ios.config.usesNonExemptEncryption` と `infoPlist.ITSAppUsesNonExemptEncryption`
  が両方 `false` になっているか
- "Export Compliance" を Skipped にせず "No (Exempt)" を選択

### Apple がレビューで Rejection
- `docs/testflight-review-notes.md` の「想定 reject 対応 (preempt)」表
  をまず確認し、該当する一次回答を Resolution Center に貼る
- 該当しない場合は内容を `docs/testflight-review-notes.md` に追記
  して PR を残す (運用ナレッジを蓄積)

---

## チェックリスト (D-U-N-S 当日)

- [ ] D-U-N-S → Apple Developer Program 加入
- [ ] App Store Connect で App 作成 (上記 §1)
- [ ] EAS init + credentials (上記 §2)
- [ ] `eas build --platform ios --profile production` (§3)
- [ ] `eas submit --platform ios --latest` (§3)
- [ ] TestFlight Test Information 埋める (§4)
- [ ] App Privacy 質問票 (§5)
- [ ] Internal Tester に自分追加 → 動作確認
- [ ] External Tester グループ作成 → 公開 link をユーザー 5-10 名に配布

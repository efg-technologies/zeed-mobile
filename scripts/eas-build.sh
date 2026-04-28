#!/usr/bin/env bash
# Non-interactive EAS Build / Submit
#
# Usage:
#   ./scripts/eas-build.sh build   <profile>           # eas build
#   ./scripts/eas-build.sh submit  [--latest]          # eas submit
#   ./scripts/eas-build.sh release <profile>           # build → submit (production 等)
#
# Defaults:
#   profile = production
#
# Examples:
#   ./scripts/eas-build.sh build development           # dev client (sideload)
#   ./scripts/eas-build.sh build preview               # internal distribution
#   ./scripts/eas-build.sh release production          # TestFlight への自動 submit まで
#
# Auth:
#   1Password CLI 経由で EXPO_TOKEN を取得する。
#   1Password に未保存の場合は `op item create` で先に登録。
#   item title: "Expo zeed-ci EXPO_TOKEN" (Password category, password フィールド)
#
# Prereqs:
#   - 1Password CLI (`brew install 1password-cli`) + サインイン済 (`eval $(op signin)`)
#   - eas-cli (`npm i -g eas-cli` or `npx eas-cli`)
#   - eas.json に profile 定義あり (このリポジトリ root)

set -euo pipefail

cmd="${1:-}"
profile="${2:-production}"

if [[ -z "$cmd" ]]; then
  echo "Usage: $0 {build|submit|release} [profile]" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

# ── EXPO_TOKEN を 1Password から取得 ──
if [[ -z "${EXPO_TOKEN:-}" ]]; then
  if ! command -v op >/dev/null 2>&1; then
    echo "error: 1Password CLI (op) が見つからない。\`brew install 1password-cli\` 後 \`eval \$(op signin)\`" >&2
    exit 1
  fi
  echo "  → 1Password から EXPO_TOKEN を取得..."
  EXPO_TOKEN="$(op item get "Expo zeed-ci EXPO_TOKEN" --fields password --reveal 2>/dev/null || true)"
  if [[ -z "$EXPO_TOKEN" ]]; then
    echo "error: 1Password に \"Expo zeed-ci EXPO_TOKEN\" が見つからない。" >&2
    echo "  https://expo.dev/accounts/[your-account]/settings/access-tokens で token 発行 → " >&2
    echo "  op item create --category=password --title='Expo zeed-ci EXPO_TOKEN' password='expo_xxx'" >&2
    exit 1
  fi
  export EXPO_TOKEN
fi

eas_cli="npx eas-cli@latest"

case "$cmd" in
  build)
    echo "═══ eas build (profile=$profile) ═══"
    $eas_cli build --platform ios --profile "$profile" --non-interactive
    ;;
  submit)
    echo "═══ eas submit (--latest) ═══"
    $eas_cli submit --platform ios --latest --non-interactive
    ;;
  release)
    echo "═══ eas build + submit (profile=$profile) ═══"
    $eas_cli build --platform ios --profile "$profile" --non-interactive --auto-submit
    ;;
  *)
    echo "error: unknown command '$cmd'. Use build|submit|release." >&2
    exit 1
    ;;
esac

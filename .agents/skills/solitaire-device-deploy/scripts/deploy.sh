#!/bin/bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_dir=$(cd "$script_dir/../../../.." && pwd)
device_json=$(mktemp /tmp/solitaire-devices.XXXXXX.json)
trap 'rm -f "$device_json"' EXIT

cd "$repo_dir"

xcrun devicectl list devices \
  --quiet \
  --filter "State CONTAINS 'available'" \
  --json-output "$device_json"

selector=${1:-}
if [[ -n "$selector" ]]; then
  selector_lower=$(printf '%s' "$selector" | tr '[:upper:]' '[:lower:]')
  matches=()
  while IFS= read -r match; do
    matches+=("$match")
  done < <(
    jq -r --arg selector "$selector_lower" '
      .result.devices[]
      | select(
          (.identifier | ascii_downcase) == $selector
          or (.deviceProperties.name | ascii_downcase | contains($selector))
          or (.hardwareProperties.deviceType | ascii_downcase) == $selector
        )
      | .identifier
    ' "$device_json"
  )
else
  matches=()
  while IFS= read -r match; do
    matches+=("$match")
  done < <(jq -r '.result.devices[].identifier' "$device_json")
fi

if [[ ${#matches[@]} -ne 1 ]]; then
  if [[ ${#matches[@]} -eq 0 ]]; then
    printf 'No available paired device matched "%s".\n' "${selector:-<only device>}" >&2
  else
    printf 'More than one device matched. Pass iphone, ipad, a name, or an identifier.\n' >&2
  fi
  jq -r '.result.devices[] | "  \(.deviceProperties.name) [\(.hardwareProperties.deviceType)] \(.identifier)"' "$device_json" >&2
  exit 1
fi

device_id=${matches[0]}
device_name=$(jq -r --arg id "$device_id" '.result.devices[] | select(.identifier == $id) | .deviceProperties.name' "$device_json")
app_path="$repo_dir/ios/DerivedData/Build/Products/Debug-iphoneos/App.app"

printf 'Deploying Solitaire to %s...\n' "$device_name"
npm run sync
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "id=$device_id" \
  -derivedDataPath ios/DerivedData \
  -allowProvisioningUpdates \
  build
xcrun devicectl device install app --device "$device_id" "$app_path"

if ! xcrun devicectl device process launch \
  --device "$device_id" \
  --terminate-existing \
  dev.ehutt.solitaire; then
  printf '\nInstalled, but iOS blocked launch. Trust the developer in Settings > General > VPN & Device Management, then open Solitaire.\n' >&2
  exit 2
fi

printf 'Solitaire is installed and running on %s.\n' "$device_name"

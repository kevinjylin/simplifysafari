#!/bin/bash
# Builds the macOS app that carries the Safari extension.
# Signing uses the Apple Development certificate already in your keychain, so
# Safari keeps the extension enabled across restarts.
set -euo pipefail
cd "$(dirname "$0")/.."

TEAM="${DEVELOPMENT_TEAM:-$(security find-certificate -c "Apple Development" -p 2>/dev/null \
  | openssl x509 -noout -subject 2>/dev/null \
  | sed -n 's/.*OU *= *\([A-Z0-9]*\).*/\1/p')}"

if [ -z "$TEAM" ]; then
  echo "No Apple Development certificate found." >&2
  echo "Open Applyfill/Applyfill.xcodeproj in Xcode, choose your team under Signing & Capabilities, and run it from there." >&2
  exit 1
fi

xcodebuild -project Applyfill/Applyfill.xcodeproj -scheme Applyfill -configuration Debug \
  -derivedDataPath build DEVELOPMENT_TEAM="$TEAM" -quiet build

echo "Built build/Build/Products/Debug/Applyfill.app"

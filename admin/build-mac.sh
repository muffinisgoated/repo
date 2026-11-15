#!/bin/zsh
set -eu
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.."
OUT="${POXEY_ADMIN_OUTPUT:-$PWD/outputs/stage5-visitors}"
APP="$OUT/PoxeyX1 Admin.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# Use the installed matching SDK. A build-only VFS overlay hides one obsolete duplicate module map; no system files are changed.
SDK_PATH="${POXEY_ADMIN_SDK:-/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk}"
python3 admin/toolchain-overlay.py "$OUT"
swiftc -parse-as-library -vfsoverlay "$OUT/toolchain-overlay.json" -Xcc -ivfsoverlay -Xcc "$OUT/toolchain-overlay.json" -sdk "$SDK_PATH" -module-cache-path /private/tmp/poxey-admin-swift-cache-fixed -target arm64-apple-macosx13.0 admin/RefreshPolicy.swift admin/App.swift -o "$APP/Contents/MacOS/PoxeyX1Admin" -framework SwiftUI -framework CryptoKit -framework Security
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>PoxeyX1Admin</string><key>CFBundleIdentifier</key><string>app.poxeyx1.webadmin</string><key>CFBundleName</key><string>PoxeyX1 Admin</string><key>CFBundleDisplayName</key><string>PoxeyX1 Admin</string><key>CFBundleVersion</key><string>0.5.5</string><key>CFBundleShortVersionString</key><string>0.5.5</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$APP"
codesign --verify --deep --strict "$APP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$OUT/PoxeyX1-Admin-0.5.5-arm64.zip"
shasum -a 256 "$OUT/PoxeyX1-Admin-0.5.5-arm64.zip" > "$OUT/SHA256SUMS.txt"
echo "Local ad-hoc-signed app packaged. Not Developer ID signed or notarized."

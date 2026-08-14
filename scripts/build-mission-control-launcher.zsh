#!/bin/zsh

set -eu

MISSION_DIR="/Users/bethanyevittsair2/Documents/GitHub/BUS123-mission-control-active"
SOURCE_APP="$MISSION_DIR/launchers/BUS123-Mission-Control.app"
INSTALLED_APP="/Users/bethanyevittsair2/Desktop/BUS123 Mission Control.app"
LAUNCHER_SOURCE="$MISSION_DIR/launchers/BUS123-Mission-Control-Launcher/main.c"
BUILD_OUTPUT="/private/tmp/BUS123-Mission-Control-Native"
EXECUTABLE_NAME="BUS123-Mission-Control-Native"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

/usr/bin/xcrun clang -O2 -Wall -Wextra -std=c11 "$LAUNCHER_SOURCE" -o "$BUILD_OUTPUT"
/bin/chmod 755 "$BUILD_OUTPUT"

/bin/cp "$BUILD_OUTPUT" "$SOURCE_APP/Contents/MacOS/$EXECUTABLE_NAME"
/bin/cp "$SOURCE_APP/Contents/Info.plist" "$INSTALLED_APP/Contents/Info.plist"
/bin/cp "$BUILD_OUTPUT" "$INSTALLED_APP/Contents/MacOS/$EXECUTABLE_NAME"
/bin/chmod 755 "$SOURCE_APP/Contents/MacOS/$EXECUTABLE_NAME"
/bin/chmod 755 "$INSTALLED_APP/Contents/MacOS/$EXECUTABLE_NAME"

/usr/bin/xattr -cr "$INSTALLED_APP"
/usr/bin/codesign --force --deep --sign - "$INSTALLED_APP"
/usr/bin/codesign --verify --deep --strict --verbose=2 "$INSTALLED_APP"
"$LSREGISTER" -u "$INSTALLED_APP"
"$LSREGISTER" -f "$INSTALLED_APP"

echo "Built and installed BUS123 Mission Control launcher 0.2.0."

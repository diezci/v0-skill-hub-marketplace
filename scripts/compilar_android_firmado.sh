#!/bin/zsh
set -euo pipefail
umask 077

DIIME_PROJECT_DIR="${0:A:h:h}"
export JAVA_HOME=/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export DIIME_ANDROID_KEYSTORE=/Users/juan/Documents/Diime-Release/diime-upload.jks
export DIIME_ANDROID_KEY_ALIAS=diime-upload
export DIIME_ANDROID_STORE_PASSWORD="$(security find-generic-password -s 'Diime Google Play Upload' -w)"
export DIIME_ANDROID_KEY_PASSWORD="$DIIME_ANDROID_STORE_PASSWORD"
trap 'unset DIIME_ANDROID_STORE_PASSWORD DIIME_ANDROID_KEY_PASSWORD' EXIT

cd "$DIIME_PROJECT_DIR"
CAPACITOR_DEBUG=false CAPACITOR_APP_URL=https://www.diime.es pnpm exec cap copy android
./android/gradlew -p android :app:bundleRelease :app:assembleRelease :app:lintRelease -q
"$JAVA_HOME/bin/jarsigner" -verify android/app/build/outputs/bundle/release/app-release.aab

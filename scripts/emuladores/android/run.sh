#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-evidence
adb install -t -r android/app/build/outputs/apk/debug/app-debug.apk
adb install -t -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w -r -e class es.diime.app.DiimeCardEmulatorTest \
  es.diime.app.test/androidx.test.runner.AndroidJUnitRunner | tee emulator-evidence/instrumentation.txt
adb exec-out run-as es.diime.app tar -cf - -C files emulator-layout | tar -xf - -C emulator-evidence
grep -Eq 'OK \(1 test\)' emulator-evidence/instrumentation.txt

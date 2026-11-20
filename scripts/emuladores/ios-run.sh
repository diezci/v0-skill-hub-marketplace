#!/usr/bin/env bash
set -euo pipefail

work=${RUNNER_TEMP:?}/diime-ios
mkdir -p "$work/fixtures" "$work/results" "$work/project"
export DIIME_LAYOUT_FIXTURE_DIR="$work/fixtures" DIIME_LAYOUT_PLATFORM=ios
node scripts/test-profesionales-layout.mjs
node scripts/test-home-layout.mjs

# Only this temporary simulator build reads the loopback server. Release settings stay in the repository.
port=18763
export CAPACITOR_APP_URL="http://localhost:$port"
cp -R ios native-shell capacitor.config.ts package.json "$work/project/"
ln -s "$PWD/node_modules" "$work/project/node_modules"
repo=$PWD
cd "$work/project"
"$repo/node_modules/.bin/cap" sync ios
python3 - <<'PY'
from pathlib import Path
import plistlib
p = Path("ios/App/App/Info.plist")
info = plistlib.loads(p.read_bytes())
info.setdefault("NSAppTransportSecurity", {})["NSAllowsLocalNetworking"] = True
p.write_bytes(plistlib.dumps(info))
# Request the simulator orientation before measuring; JS also checks its actual viewport.
p = Path("ios/App/App/SceneDelegate.swift")
source = p.read_text()
anchor = "window?.makeKeyAndVisible()"
assert source.count(anchor) == 1
p.write_text(source.replace(anchor, anchor + """
        if #available(iOS 16.0, *) {
            let landscape = ProcessInfo.processInfo.environment["DIIME_TEST_ORIENTATION"] == "landscape"
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                windowScene.requestGeometryUpdate(.iOS(interfaceOrientations: landscape ? .landscapeLeft : .portrait))
            }
        }
"""))
PY

device=$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
ios = sorted((k for k in devices if ".iOS-" in k), key=lambda s: tuple(int(i) for i in s.split(".iOS-")[1].split("-")), reverse=True)
print(next(d["udid"] for k in ios for d in devices[k] if d["name"].startswith("iPhone") and d.get("isAvailable")))')
xcrun simctl bootstatus "$device" -b
xcodebuild -version
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination "id=$device" -configuration Debug -derivedDataPath "$work/build" CODE_SIGNING_ALLOWED=NO build > "$work/results/build.log" || { tail -120 "$work/results/build.log"; exit 1; }
xcrun simctl install "$device" "$work/build/Build/Products/Debug-iphonesimulator/App.app"
xcrun simctl list devices booted > "$work/results/device.txt"
for orientation in portrait landscape; do
  python3 "$repo/scripts/emuladores/ios-check.py" "$work/fixtures" "$work/results" "$orientation" "$port" &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT
  for i in {1..30}; do curl -fsS "http://localhost:$port/health" >/dev/null 2>&1 && break; sleep 1; done
  SIMCTL_CHILD_DIIME_TEST_ORIENTATION="$orientation" xcrun simctl launch --terminate-running-process "$device" es.diime.app
  for i in {1..120}; do test -f "$work/results/$orientation.json" && break; sleep 1; done
  xcrun simctl io "$device" screenshot "$work/results/$orientation.png"
  python3 - "$work/results/$orientation.json" <<'PY'
import json, sys
from pathlib import Path
result = json.loads(Path(sys.argv[1]).read_text())
for row in result:
    print(row)
assert len(result) == 12 and all(r["passed"] for r in result), "Incomplete or failed iOS layout checks"
PY
  kill "$server"
  wait "$server" || true
  trap - EXIT
done

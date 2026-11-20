"""Serve the PR's offline card fixtures to Diime's simulator build and record WKWebView results."""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

fixture_dir, result_dir, orientation, port = sys.argv[1:]
pages = sorted(Path(fixture_dir).glob("*.html"))
assert len(pages) == 12, f"Expected 12 grid, list and homepage cases, found {len(pages)}"
result = Path(result_dir) / f"{orientation}.json"
result.unlink(missing_ok=True)
records = []

script = """
<script>
(async () => {
  const portrait = ORIENTATION === "portrait";
  const ready = () => innerWidth > 0 && ((innerHeight > innerWidth) === portrait);
  let passed = false, error = "";
  try {
    for (let i = 0; i < 150 && (!ready() || !window.Capacitor?.isNativePlatform()); i++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (window.Capacitor?.getPlatform() !== "ios" || !window.Capacitor.isNativePlatform()) {
      throw Error("Expected Diime's iOS Capacitor bridge");
    }
    if (!ready()) throw Error("Wrong viewport orientation: " + innerWidth + "x" + innerHeight);
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const checked = await window.runLayoutChecks();
    passed = checked?.passed === true;
    error = checked?.error || "";
    const first = document.querySelector('[data-slot="card"]');
    if (first) first.scrollIntoView({block: "start"});
  } catch (e) { error = String(e); }
  const response = await fetch("/result", {method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({index:INDEX, passed, error, width:innerWidth, height:innerHeight, platform:window.Capacitor?.getPlatform()})});
  const {next} = await response.json();
  if (next) location.replace(next);
})();
</script>
"""


class Handler(BaseHTTPRequestHandler):
    def reply(self, body, mime, status=200):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/health":
            return self.reply("ok", "text/plain")
        if path == "/":
            index = 0
        elif path.startswith("/case/") and path[6:].isdigit():
            index = int(path[6:])
        else:
            return self.send_error(404)
        if not 0 <= index < len(pages):
            return self.send_error(404)
        html = pages[index].read_text()
        probe = script.replace("ORIENTATION", json.dumps(orientation)).replace("INDEX", str(index))
        self.reply(html.replace("</body>", probe + "</body>"), "text/html; charset=utf-8")

    def do_POST(self):
        if self.path != "/result":
            return self.send_error(404)
        data = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        i = data["index"]
        if i != len(records) or not 0 <= i < len(pages):
            return self.send_error(409)
        data["fixture"] = pages[i].name
        data["passed"] = bool(data["passed"] and data.get("platform") == "ios")
        records.append(data)
        print(json.dumps(data, ensure_ascii=False), flush=True)
        next_page = f"/case/{i + 1}" if data["passed"] and i + 1 < len(pages) else None
        if next_page is None:
            tmp = result.with_suffix(".tmp")
            tmp.write_text(json.dumps(records, indent=2))
            tmp.replace(result)
        self.reply(json.dumps({"next": next_page}), "application/json")


HTTPServer(("127.0.0.1", int(port)), Handler).serve_forever()

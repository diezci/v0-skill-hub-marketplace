import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "typescript"

const source = ts.transpileModule(readFileSync(new URL("../hooks/use-viewport-adaptable.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function eventTarget() {
  const listeners = new Map()
  return {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn) },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn) },
    emit(name) { for (const fn of listeners.get(name) || []) fn() },
    count() { return [...listeners.values()].reduce((sum, list) => sum + list.size, 0) },
  }
}
function fixture({ visual = true } = {}) {
  const viewport = visual ? { ...eventTarget(), width: 466, height: 678, scale: 1, offsetTop: 0 } : null
  const frames = new Map(), properties = new Map()
  let nextId = 0, effects = 0, cleanup
  const window = {
    ...eventTarget(), visualViewport: viewport, innerWidth: 466, innerHeight: 678,
    requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
  }
  const style = { setProperty(key, value) { properties.set(key, value) }, removeProperty(key) { properties.delete(key) } }
  const module = { exports: {} }
  vm.runInNewContext(source, {
    module, exports: module.exports, window, document: { documentElement: { style } },
    require(name) {
      assert.equal(name, "react")
      return { useEffect(fn) { effects++; cleanup = fn() } }
    },
  })
  module.exports.useViewportAdaptable()
  return {
    window, viewport, properties, frames,
    flush() { const queue = [...frames.values()]; frames.clear(); queue.forEach(fn => fn()) },
    cleanup() { cleanup() },
    effectCount() { return effects },
  }
}
const height = f => f.properties.get("--diime-viewport-height")
const top = f => f.properties.get("--diime-viewport-top")

const f = fixture()
assert.equal(height(f), "678px")
for (const [width, h] of [[890, 626], [626, 890], [390, 626], [466, 678], [1280, 900]]) {
  Object.assign(f.window, { innerWidth: width, innerHeight: h })
  Object.assign(f.viewport, { width, height: h })
  f.window.emit("resize"); f.viewport.emit("resize"); f.window.emit("orientationchange")
  assert.equal(f.frames.size, 1, "A burst of resize events must share one animation frame")
  f.flush()
  assert.equal(height(f), `${h}px`)
  assert.equal(f.effectCount(), 1, "Resizing must not remount the page or its state")
}
console.log("PASS Compact, expanded, rotated, split and desktop windows update without remounts")

Object.assign(f.window, { innerHeight: 678 })
Object.assign(f.viewport, { height: 318, offsetTop: 25 })
f.viewport.emit("resize"); f.viewport.emit("scroll"); f.flush()
assert.equal(height(f), "318px")
assert.equal(top(f), "25px")
f.viewport.height = 678; f.viewport.offsetTop = 0
f.viewport.emit("resize"); f.flush()
assert.equal(height(f), "678px")
assert.equal(top(f), "0px")
console.log("PASS Keyboard opening, visible origin and dismissal restore usable height")

Object.assign(f.viewport, { height: 220, offsetTop: 80, scale: 2 })
f.viewport.emit("resize"); f.viewport.emit("scroll"); f.flush()
assert.equal(height(f), "678px", "Accessibility zoom must not shrink the app layout")
assert.equal(top(f), "0px")
Object.assign(f.viewport, { height: 626, offsetTop: 0, scale: 1 })
f.window.innerHeight = 626; f.window.emit("pageshow"); f.flush()
assert.equal(height(f), "626px")
console.log("PASS Pinch zoom does not reflow the page; returning to normal size refreshes it")

const zoomResize = fixture()
Object.assign(zoomResize.viewport, { height: 339, offsetTop: 30, scale: 2 })
zoomResize.viewport.emit("resize"); zoomResize.flush()
assert.equal(height(zoomResize), "678px")
for (const [width, h] of [[890, 626], [626, 890], [390, 626], [466, 678]]) {
  Object.assign(zoomResize.window, { innerWidth: width, innerHeight: h })
  Object.assign(zoomResize.viewport, { width: width / 2, height: h / 2, offsetTop: 40 })
  zoomResize.window.emit("resize"); zoomResize.viewport.emit("resize"); zoomResize.window.emit("orientationchange")
  zoomResize.flush()
  assert.equal(height(zoomResize), `${h}px`, "A real window resize must update layout while zoom remains active")
  assert.equal(top(zoomResize), "0px", "Panning a zoomed page must not move the dialog's layout origin")
  assert.equal(zoomResize.viewport.scale, 2, "The app must never reset the user's zoom")
  assert.equal(zoomResize.effectCount(), 1)
}
// While magnified, visual height can describe a zoomed or not-yet-updated area.
Object.assign(zoomResize.window, { innerWidth: 890, innerHeight: 626 })
Object.assign(zoomResize.viewport, { width: 445, height: 210, scale: 2 })
zoomResize.window.emit("resize"); zoomResize.flush()
assert.equal(height(zoomResize), "626px")
zoomResize.viewport.height = 140; zoomResize.viewport.scale = 3
zoomResize.viewport.emit("resize"); zoomResize.flush()
assert.equal(height(zoomResize), "626px", "Another pinch must preserve the new layout viewport")
zoomResize.viewport.height = 420; zoomResize.viewport.scale = 1
zoomResize.viewport.emit("resize"); zoomResize.flush()
assert.equal(height(zoomResize), "420px", "At normal scale the visible keyboard-adjusted height is used again")
zoomResize.cleanup()
console.log("PASS Folding, rotating and split resizing at zoom 2 update the window without resetting zoom")

const orderedResize = fixture()
Object.assign(orderedResize.viewport, { height: 339, scale: 2 })
orderedResize.viewport.emit("resize"); orderedResize.flush()
// Separate frames reproduce the layout event arriving before the visual event.
Object.assign(orderedResize.window, { innerWidth: 626, innerHeight: 890 })
orderedResize.window.emit("resize"); orderedResize.flush()
assert.equal(height(orderedResize), "890px", "A stale visual viewport must not freeze the old window height")
Object.assign(orderedResize.viewport, { width: 313, height: 445 })
orderedResize.viewport.emit("resize"); orderedResize.flush()
assert.equal(height(orderedResize), "890px")
// Reverse ordering must also converge without moving or resetting the zoom.
Object.assign(orderedResize.viewport, { width: 445, height: 313, offsetTop: 60 })
orderedResize.viewport.emit("resize"); orderedResize.flush()
assert.equal(height(orderedResize), "890px")
Object.assign(orderedResize.window, { innerWidth: 890, innerHeight: 626 })
orderedResize.window.emit("resize"); orderedResize.flush()
assert.equal(height(orderedResize), "626px")
assert.equal(top(orderedResize), "0px")
assert.equal(orderedResize.viewport.scale, 2)
orderedResize.cleanup()
console.log("PASS Window and visual viewport resize events converge in either order across separate frames")

for (const invalid of [0, Number.NaN, -10]) {
  f.viewport.height = invalid; f.viewport.emit("resize"); f.flush()
  assert.equal(height(f), "626px")
}
console.log("PASS Transient invalid viewport dimensions do not collapse the interface")

f.window.emit("resize")
assert.equal(f.frames.size, 1)
f.cleanup()
assert.equal(f.frames.size, 0)
assert.equal(f.window.count(), 0)
assert.equal(f.viewport.count(), 0)
assert.equal(f.properties.size, 0)
console.log("PASS Unmount cancels pending updates and removes all listeners and owned CSS values")

const fallback = fixture({ visual: false })
assert.equal(height(fallback), "678px")
fallback.window.innerHeight = 466; fallback.window.emit("orientationchange"); fallback.flush()
assert.equal(height(fallback), "466px")
assert.equal(top(fallback), "0px")
fallback.cleanup()
console.log("PASS Browsers without VisualViewport keep resize and orientation support")
console.log("8 adaptive viewport scenarios passed with no browser, network, or account access.")

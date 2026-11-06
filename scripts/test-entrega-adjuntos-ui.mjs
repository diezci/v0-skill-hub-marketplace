import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"

const jsx = (type, props) => ({ type, props })
const walk = (node) => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === "object" ? [node, ...walk(node.props?.children)] : []
const textOf = (node) => Array.isArray(node) ? node.map(textOf).join("") : node && typeof node === "object" ? textOf(node.props?.children) : String(node ?? "")

function compile(file, dependencies = {}) {
  const module = { exports: {} }
  const result = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  })
  assert.equal(result.diagnostics.length, 0)
  vm.runInNewContext(result.outputText, { module, exports: module.exports, URL, Uint8Array, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`)
    return dependencies[name]
  } })
  return module.exports
}

const { validarArchivo } = compile("lib/archivos.ts")
const entregas = compile("lib/entregas.ts")
const { nombreDeAdjunto } = compile("components/adjuntos-lista.tsx", {
  "react/jsx-runtime": { jsx, jsxs: jsx },
  "@/components/idioma-provider": { useIdioma: () => ({ idioma: "es", t: x => x }) },
  "lucide-react": { FileText: "FileText", ImageIcon: "ImageIcon" },
})

function fixture({ initialFiles = [], upload, context = "entrega" } = {}) {
  let cursor = 0, archivos = initialFiles, disabled = false
  const state = [], busy = [], uploads = [], changes = []
  const hooks = {
    useId: () => "delivery-fixture",
    useRef(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = { current: initial }
      return state[index]
    },
    useState(initial) {
      const index = cursor++
      if (!(index in state)) state[index] = initial
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value }]
    },
  }
  const { EntregaAdjuntos } = compile("components/entrega-adjuntos.tsx", {
    react: hooks,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": Object.fromEntries(["AlertTriangle", "FileText", "Loader2", "Paperclip", "X"].map(x => [x, x])),
    "@/components/idioma-provider": { useIdioma: () => ({ idioma: "es", t: (key, vars = {}) => key.replace(/\{(\w+)\}/g, (_, name) => String(vars[name])) }) },
    "@/components/adjuntos-lista": { nombreDeAdjunto },
    "@/components/ui/button": { Button: "button" },
    "@/lib/archivos": { validarArchivo },
    "@/lib/entregas": entregas,
    "@/lib/upload-helpers": { uploadFile: async (file) => {
      uploads.push(file.name)
      return upload ? upload(file) : { url: `https://diime.test/api/archivos/12345678-1234-1234-1234-123456789abc?nombre=${encodeURIComponent(file.name)}` }
    } },
  })
  return {
    uploads, busy, changes,
    get files() { return [...archivos] },
    setDisabled(value) { disabled = value },
    render() {
      cursor = 0
      const root = EntregaAdjuntos({ archivos, disabled, context, onChange(next) { archivos = next; changes.push([...next]) }, onUploadingChange(value) { busy.push(value) } })
      const nodes = walk(root)
      return { root, nodes, input: nodes.find(x => x.type === "input"), alert: nodes.find(x => x.props?.role === "alert"), buttons: nodes.filter(x => x.type === "button") }
    },
    async select(files) {
      const event = { target: { files, value: "selected" } }
      await this.render().input.props.onChange(event)
      assert.equal(event.target.value, "", "The same file can be reselected after an error")
    },
  }
}

const document = name => new File(["Completed work"], name, { type: "text/plain" })
const existing = "https://diime.test/api/archivos/12345678-1234-1234-1234-123456789abc?nombre=existente.pdf"

test("delivery attachments remain optional and show the evidence recommendation", () => {
  const f = fixture()
  const { root, input, buttons } = f.render()
  assert.match(textOf(root), /Para evitar problemas, te recomendamos adjuntar evidencias de que el trabajo está completado/)
  assert.match(textOf(root), /Archivos de la entrega \(opcional\)/)
  assert.equal(input.props.required, undefined)
  assert.equal(input.props.multiple, true)
  assert.equal(input.props["aria-labelledby"], "delivery-fixture-label")
  assert.ok(buttons.every(button => button.props.type === "button"), "File controls must not submit the delivery form")
})

test("multiple uploads preserve prior evidence, expose real filenames and support removal", async () => {
  const f = fixture({ initialFiles: [existing] })
  await f.select([document("Trabajo completado.txt"), document("Entrega María.txt")])
  assert.equal(f.files.length, 3)
  assert.equal(f.files[0], existing)
  assert.deepEqual(f.busy, [true, false])
  let { nodes, buttons } = f.render()
  assert.deepEqual(nodes.filter(x => x.type === "a").map(x => textOf(x)), ["existente.pdf", "Trabajo completado.txt", "Entrega María.txt"])
  buttons.find(x => x.props["aria-label"] === "Quitar Trabajo completado.txt").props.onClick()
  assert.equal(f.files.length, 2)
  assert.equal(f.files[0], existing)
  assert.match(f.files[1], /Entrega%20Mar%C3%ADa/)
})

test("selection over five files is rejected without uploading or discarding existing evidence", async () => {
  const f = fixture({ initialFiles: [existing] })
  await f.select(Array.from({ length: 5 }, (_, i) => document(`${i}.txt`)))
  assert.equal(f.uploads.length, 0)
  assert.deepEqual(f.files, [existing])
  assert.match(textOf(f.render().alert), /máximo de 5 archivos/)
  const full = fixture({ initialFiles: Array.from({ length: 5 }, (_, i) => `${existing}&i=${i}`) }).render()
  assert.equal(full.input.props.disabled, true)
  assert.equal(full.buttons[0].props.disabled, true)
})

test("invalid type, empty content and mismatched signature reject the entire batch", async () => {
  for (const invalid of [
    document("evidence.exe"),
    new File([], "empty.txt"),
    document("not-a-photo.png"),
  ]) {
    const f = fixture()
    await f.select([document("valid.txt"), invalid])
    assert.equal(f.uploads.length, 0, invalid.name)
    assert.equal(f.files.length, 0)
    assert.ok(f.render().alert, `${invalid.name} must display an error`)
    assert.deepEqual(f.busy, [true, false])
  }
})

test("four MB files are accepted and larger files are rejected before any upload starts", async () => {
  const f = fixture()
  await f.select([new File([Buffer.alloc(entregas.MAX_ARCHIVO_ENTREGA_BYTES, "a")], "exactly-four-mb.txt")])
  assert.equal(f.files.length, 1)
  assert.deepEqual(f.uploads, ["exactly-four-mb.txt"])
  const oversized = fixture({ initialFiles: [existing] })
  await oversized.select([new File([Buffer.alloc(entregas.MAX_ARCHIVO_ENTREGA_BYTES + 1, "a")], "too-large.txt")])
  assert.equal(oversized.uploads.length, 0)
  assert.deepEqual(oversized.files, [existing])
  assert.deepEqual(oversized.busy, [])
  assert.match(textOf(oversized.render().alert), /máximo 4 MB/)
})

test("active uploads block all controls, notify the parent and ignore concurrent selection", async () => {
  let release
  const deferred = new Promise(resolve => { release = resolve })
  const f = fixture({ initialFiles: [existing], upload: () => deferred })
  const first = f.select([document("evidence.txt")])
  await Promise.resolve()
  const active = f.render()
  assert.equal(active.input.props.disabled, true)
  assert.ok(active.buttons.every(x => x.props.disabled))
  assert.ok(active.nodes.find(x => x.props?.role === "status"))
  assert.deepEqual(f.busy, [true])
  await f.select([document("duplicate.txt")])
  release({ url: `${existing}&new=1` })
  await first
  assert.deepEqual(f.uploads, ["evidence.txt"])
  assert.deepEqual(f.busy, [true, false])
  assert.equal(f.render().input.props.disabled, false)
})

test("failed uploads name missing files while retaining successful and existing evidence", async () => {
  const f = fixture({ initialFiles: [existing], upload: async file => file.name === "fail.txt" ? null : { url: `${existing}&new=1` } })
  await f.select([document("ok.txt"), document("fail.txt")])
  assert.equal(f.files.length, 2)
  assert.equal(f.files[0], existing)
  assert.match(textOf(f.render().alert), /No se pudieron adjuntar: fail.txt/)
  assert.deepEqual(f.busy, [true, false])
})

test("unexpected upload errors release the busy state and show a retry message", async () => {
  const f = fixture({ upload: async () => { throw Error("network failure") } })
  await f.select([document("evidence.txt")])
  assert.match(textOf(f.render().alert), /Vuelve a intentarlo antes de entregar/)
  assert.deepEqual(f.busy, [true, false])
  assert.equal(f.files.length, 0)
})

test("disabled parent prevents uploads and selection cancellation has no side effects", async () => {
  const f = fixture()
  f.setDisabled(true)
  await f.select([document("evidence.txt")])
  assert.equal(f.uploads.length, 0)
  f.setDisabled(false)
  await f.select([])
  assert.equal(f.changes.length, 0)
  assert.equal(f.busy.length, 0)
})

test("rejection context recommends evidence of problems and preserves optional attachments", () => {
  const { root, input } = fixture({ context: "rechazo" }).render()
  assert.match(textOf(root), /te recomendamos adjuntar evidencias de los problemas detectados/)
  assert.match(textOf(root), /Archivos del rechazo \(opcional\)/)
  assert.doesNotMatch(textOf(root), /evidencias de que el trabajo está completado/)
  assert.equal(input.props.required, undefined)
})

test("rejection uploads retain evidence and present a rejection-specific error on partial failure", async () => {
  const f = fixture({ context: "rechazo", initialFiles: [existing], upload: async file => file.name === "fail.txt" ? null : { url: `${existing}&rejection=1` } })
  await f.select([document("damage.txt"), document("fail.txt")])
  assert.equal(f.files.length, 2)
  assert.equal(f.files[0], existing)
  assert.match(textOf(f.render().alert), /fail.txt\. Vuelve a seleccionarlos antes de rechazar la entrega/)
  assert.deepEqual(f.busy, [true, false])
})

test("rejection context reports in-progress uploads and releases its parent on an upload exception", async () => {
  let reject
  const deferred = new Promise((_, failure) => { reject = failure })
  const f = fixture({ context: "rechazo", upload: () => deferred })
  const pending = f.select([document("damage.txt")])
  await Promise.resolve()
  assert.match(textOf(f.render().root), /Espera a que terminen de subir los archivos antes de rechazar la entrega/)
  reject(new Error("synthetic network failure"))
  await pending
  assert.match(textOf(f.render().alert), /Vuelve a intentarlo antes de rechazar la entrega/)
  assert.deepEqual(f.busy, [true, false])
})

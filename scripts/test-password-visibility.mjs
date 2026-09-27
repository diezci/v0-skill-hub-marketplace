import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import vm from "node:vm"
import ts from "typescript"
import * as jsx from "react/jsx-runtime"
import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
function transpile(path, dependencies) {
  const source = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  })
  assert.equal(source.diagnostics.length, 0, `${path} must transpile without errors`)
  const module = { exports: {} }
  vm.runInNewContext(source.outputText, {
    module, exports: module.exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  })
  return module.exports
}

let nextId = 0
function fixture(initialIdioma = "es") {
  let cursor = 0, idioma = initialIdioma
  const states = [], instanceId = `password-${nextId++}`
  const hooks = {
    useId: () => instanceId,
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value }]
    },
  }
  const common = { react: hooks, "react/jsx-runtime": jsx, "@/lib/utils": { cn: (...args) => twMerge(clsx(args)) } }
  const { Input } = transpile("components/ui/input.tsx", common)
  const { PasswordInput } = transpile("components/ui/password-input.tsx", {
    ...common, react: hooks,
    "lucide-react": { Eye: "Eye", EyeOff: "EyeOff" },
    "@/components/idioma-provider": { useIdioma: () => ({ idioma }) },
    "@/components/ui/input": { Input },
  })
  return {
    setIdioma(next) { idioma = next },
    render(props = {}) {
      cursor = 0
      const wrapper = PasswordInput(props)
      const [inputElement, button] = wrapper.props.children
      // Render the real shared Input as well, to check native input prop forwarding.
      return { wrapper, input: inputElement.type(inputElement.props), button }
    },
  }
}

test("password starts masked and toggles without modifying its value or form behavior", () => {
  const f = fixture()
  const props = { id: "login-password", value: "synthetic password", name: "password", form: "login", autoComplete: "current-password", required: true }
  let { input, button } = f.render(props)
  assert.equal(input.type, "input")
  assert.equal(input.props.type, "password")
  assert.equal(button.props.type, "button", "Visibility must not submit the surrounding form")
  assert.equal(button.props["aria-pressed"], false)
  assert.equal(button.props["aria-controls"], input.props.id)
  assert.equal(button.props["aria-label"], "Mostrar contraseña")

  for (const visible of [true, false, true, false]) {
    button.props.onClick()
    ;({ input, button } = f.render(props))
    assert.equal(input.props.type, visible ? "text" : "password")
    assert.equal(button.props["aria-pressed"], visible)
    assert.equal(button.props["aria-label"], visible ? "Ocultar contraseña" : "Mostrar contraseña")
    for (const [key, value] of Object.entries(props)) assert.equal(input.props[key], value)
  }
})

test("input forwards ref, controlled value, events, validation, className and form props", () => {
  const f = fixture()
  const ref = { current: null }, changes = [], blurs = []
  const props = {
    ref, className: "pl-10 border-red-500", value: "synthetic", name: "new-password", form: "account-form",
    autoComplete: "new-password", minLength: 6, maxLength: 100, required: true, readOnly: true,
    "aria-invalid": true, "aria-describedby": "password-error", "data-test": "forwarded",
    onChange: (event) => changes.push(event.target.value), onBlur: () => blurs.push(true),
  }
  const { input, button } = f.render(props)
  for (const [key, value] of Object.entries(props)) if (key !== "className") assert.equal(input.props[key], value, key)
  assert.match(input.props.className, /\bpl-10\b/)
  assert.match(input.props.className, /\bpr-12\b/)
  assert.match(input.props.className, /\bborder-red-500\b/)
  input.props.onChange({ target: { value: "synthetic update" } })
  input.props.onBlur()
  button.props.onClick()
  assert.deepEqual(changes, ["synthetic update"], "Toggling must not synthesize input changes")
  assert.equal(blurs.length, 1)
  assert.equal(f.render({ ...props, value: "synthetic update" }).input.props.value, "synthetic update")
})

test("generated ids remain stable and each password field has independent visibility", () => {
  const first = fixture(), second = fixture()
  const a = first.render(), b = second.render()
  assert.notEqual(a.input.props.id, b.input.props.id)
  assert.equal(a.button.props["aria-controls"], a.input.props.id)
  a.button.props.onClick()
  assert.equal(first.render().input.props.id, a.input.props.id)
  assert.equal(first.render().input.props.type, "text")
  assert.equal(second.render().input.props.type, "password")
})

test("English labels follow current language without clearing visibility or the value", () => {
  const f = fixture("en")
  const props = { defaultValue: "synthetic default", autoComplete: "new-password" }
  let result = f.render(props)
  assert.equal(result.button.props["aria-label"], "Show password")
  result.button.props.onClick()
  result = f.render(props)
  assert.equal(result.button.props["aria-label"], "Hide password")
  assert.equal(result.input.props.defaultValue, props.defaultValue)
  assert.equal(result.input.props.value, undefined, "Uncontrolled inputs must stay uncontrolled")
  f.setIdioma("es")
  result = f.render(props)
  assert.equal(result.button.props["aria-label"], "Ocultar contraseña")
  assert.equal(result.input.props.type, "text")
})

test("toggle has a 44px target, keyboard access, decorative icons and disabled propagation", () => {
  const f = fixture()
  const { input, button } = f.render({ disabled: true })
  assert.equal(input.props.disabled, true)
  assert.equal(button.props.disabled, true)
  assert.match(button.props.className, /\bh-11\b/)
  assert.match(button.props.className, /\bw-11\b/)
  assert.match(input.props.className, /\bmin-h-11\b/)
  assert.match(button.props.className, /focus-visible:ring-2/)
  assert.notEqual(button.props.tabIndex, -1, "A native button must remain keyboard reachable")
  assert.equal(button.props.children.props["aria-hidden"], "true")
  let prevented = false
  button.props.onMouseDown({ preventDefault() { prevented = true } })
  assert.equal(prevented, true, "A pointer toggle must preserve focus in the password input")
})

test("all seven password fields use the reusable control and preserve autofill semantics", () => {
  const expected = new Map([
    ["app/auth/login/page.tsx", { password: "current-password" }],
    ["app/auth/registro/page.tsx", { password: "new-password", "repeat-password": "new-password" }],
    ["app/auth/actualizar-contrasena/page.tsx", { password: "new-password", confirmPassword: "new-password" }],
    ["components/cambiar-contrasena-form.tsx", { "nueva-contrasena": "new-password", "confirmar-contrasena": "new-password" }],
  ])
  for (const [path, fields] of expected) {
    const file = ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const found = new Map()
    function visit(node) {
      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const name = node.tagName.getText(file)
        const attributes = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map((attr) => [attr.name.getText(file), attr.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : undefined]))
        assert.notEqual(attributes.get("type"), "password", `${path} still has a non-toggle password field`)
        if (name === "PasswordInput") found.set(attributes.get("id"), attributes.get("autoComplete"))
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
    assert.deepEqual(Object.fromEntries(found), fields, path)
  }
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { datosFactura, nodos, renderFactura } from './fixtures/factura-render.mjs'

function enlace(native) {
  const paths = []
  const module = { exports: {} }
  const source = readFileSync(new URL('../components/enlace-justificante.tsx', import.meta.url), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const dependencies = {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'next/navigation': { useRouter: () => ({ push: path => paths.push(path) }) },
    '@capacitor/core': { Capacitor: { isNativePlatform: () => native } },
  }
  vm.runInNewContext(code, { module, exports: module.exports, require(name) { assert.ok(Object.hasOwn(dependencies, name)); return dependencies[name] } })
  return { paths, node: module.exports.EnlaceJustificante({ trabajoId: 'qa-contract', children: 'Ver justificante' }) }
}

test('native receipt stays in the authenticated WebView', () => {
  const { paths, node } = enlace(true)
  let prevented = false
  node.props.onClick({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.deepEqual(paths, ['/trabajos/qa-contract/factura'])
})

test('web receipt keeps its normal new-tab navigation', () => {
  const { paths, node } = enlace(false)
  node.props.onClick({ preventDefault() { assert.fail('Web navigation should use the anchor') } })
  assert.equal(node.props.href, '/trabajos/qa-contract/factura')
  assert.equal(node.props.target, '_blank')
  assert.equal(node.props.rel, 'noopener noreferrer')
  assert.deepEqual(paths, [])
})

for (const [rol, path] of [['cliente', '/mis-solicitudes'], ['proveedor', '/mis-trabajos'], ['admin', '/admin/trabajos']]) {
  test(`${rol}: single-payment receipt offers an authorized workspace return`, async () => {
    const tree = await renderFactura({ datos: datosFactura({ rol }) })
    assert.ok(nodos(tree).some(node => node.type === 'a' && node.props.href === path))
  })
}

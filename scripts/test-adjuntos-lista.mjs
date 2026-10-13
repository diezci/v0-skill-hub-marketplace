import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const jsx = (type, props) => ({ type, props })
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/adjuntos-lista.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, { module, exports: module.exports, URL, require(name) {
  if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
  if (name === '@/components/idioma-provider') return { useIdioma: () => ({ idioma: 'es', t: x => x }) }
  if (name === 'lucide-react') return { FileText: 'FileText', ImageIcon: 'ImageIcon' }
  throw Error(name)
} })
const { nombreDeAdjunto, AdjuntosLista } = module.exports
const walk = node => Array.isArray(node) ? node.flatMap(walk) : node && typeof node === 'object' ? [node, ...walk(node.props?.children)] : []
const id = '12345678-1234-1234-1234-123456789abc'
const image = `https://diime.test/api/archivos/${id}?nombre=${encodeURIComponent('Revisión + cocina #1.PNG')}`
const document = `/api/archivos/${id}?nombre=${encodeURIComponent('Presupuesto María.pdf')}`
const legacy = 'https://fixture.public.blob.vercel-storage.com/Foto-' + 'a'.repeat(30) + '.jpg?download=1'
assert.equal(nombreDeAdjunto(image, 0), 'Revisión + cocina #1.PNG')
assert.equal(nombreDeAdjunto(document, 0), 'Presupuesto María.pdf')
assert.equal(nombreDeAdjunto(legacy, 0), 'Foto.jpg')
assert.equal(nombreDeAdjunto(`/api/archivos/${id}`, 1, 'en'), 'File 2')
assert.equal(nombreDeAdjunto(`/api/archivos/${id}?nombre=${encodeURIComponent('original-' + 'a'.repeat(30) + '.pdf')}`, 0), 'original-' + 'a'.repeat(30) + '.pdf')
assert.equal(nombreDeAdjunto('https://fixture.test/real.pdf?nombre=fake.png', 0), 'real.pdf')
const nodes = walk(AdjuntosLista({ archivos: [image, document, legacy] }))
assert.deepEqual(nodes.filter(x => x.type === 'img').map(x => x.props.src), [image, legacy])
assert.deepEqual(nodes.filter(x => x.type === 'a').map(x => [x.props.href, x.props.title]), [[image, 'Revisión + cocina #1.PNG'], [document, 'Presupuesto María.pdf'], [legacy, 'Foto.jpg']])
console.log('PASS 8 comprobaciones: nombre y miniatura privados, nombre exacto, enlace legacy, fallback, parámetros ajenos ignorados y URLs preservadas.')

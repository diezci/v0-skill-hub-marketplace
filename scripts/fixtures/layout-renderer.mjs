// Render the project's TSX components, translations and Tailwind stylesheet with fixture data.
import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"
import ts from "typescript"
import * as React from "react"
import postcss from "postcss"
import tailwindcss from "@tailwindcss/postcss"

const root = fileURLToPath(new URL("../../", import.meta.url))
const require = createRequire(import.meta.url)

export async function compileLayoutCss() {
  const file = path.join(root, "app/globals.css")
  const { css } = await postcss([tailwindcss({ base: root })]).process(readFileSync(file, "utf8"), { from: file })
  return css
}

export function createLayoutLoader({ language, dependency, sourceFor = () => undefined }) {
  const cache = new Map()
  function load(relative) {
    const absolute = path.resolve(root, relative)
    if (cache.has(absolute)) return cache.get(absolute)
    const module = { exports: {} }
    cache.set(absolute, module.exports)
    const compiled = ts.transpileModule(readFileSync(sourceFor(relative) || absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText
    vm.runInNewContext(compiled, {
      module, exports: module.exports, console, URLSearchParams,
      require(name) {
        const substitute = dependency(name, relative)
        if (substitute !== undefined) return substitute
        if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) }
        if (name === "@/components/idioma-provider") {
          const t = (key, parameters) => load("lib/i18n.ts").traducir(language(), key, parameters)
          return { useIdioma: () => ({ idioma: language(), t }), useT: () => t }
        }
        if (name.startsWith("@/") || name.startsWith(".")) {
          const local = name.startsWith("@/") ? name.slice(2) : path.relative(root, path.resolve(path.dirname(absolute), name))
          for (const extension of ["", ".tsx", ".ts"]) {
            if (existsSync(path.resolve(root, local + extension))) return load(local + extension)
          }
          throw Error(`Missing local dependency: ${name}`)
        }
        return require(name)
      },
    }, { filename: absolute })
    return module.exports
  }
  return load
}

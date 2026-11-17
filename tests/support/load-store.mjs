// Charge le vrai store (TypeScript transpilé en mémoire) avec un stockage local simulé.
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export const storage = new Map()
globalThis.localStorage ??= {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
}

const modules = new Map()
export function loadSource(file) {
  if (modules.has(file)) return modules.get(file)
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  const code = outputText.replace(/(from\s+|import\s*)["']([^"']+)["']/g, (_, prefix, specifier) => {
    let resolved
    if (specifier.startsWith('.')) {
      const base = path.resolve(path.dirname(file), specifier)
      resolved = loadSource(['.ts', '.tsx'].map(ext => base + ext).find(fs.existsSync))
    } else resolved = import.meta.resolve(specifier)
    return `${prefix}${JSON.stringify(resolved)}`
  })
  const url = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  modules.set(file, url)
  return url
}

export function loadStore() {
  return import(loadSource(path.resolve('src/store.ts')))
}

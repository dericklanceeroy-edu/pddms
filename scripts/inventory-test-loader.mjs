/* eslint-disable @typescript-eslint/explicit-function-return-type -- Node loader uses JavaScript. */
import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron')
    return {
      shortCircuit: true,
      url: new URL('./inventory-test-electron.mjs', import.meta.url).href
    }
  let path
  if (specifier.startsWith('@main/')) path = resolvePath(root, 'src/main', specifier.slice(6))
  else if (specifier.startsWith('@shared/'))
    path = resolvePath(root, 'src/shared', specifier.slice(8))
  else if (specifier.startsWith('@renderer/'))
    path = resolvePath(root, 'src/renderer/src', specifier.slice(10))
  else if (specifier.startsWith('.') && context.parentURL)
    path = fileURLToPath(new URL(specifier, context.parentURL))
  if (path) {
    if (existsSync(`${path}.ts`)) path += '.ts'
    else if (existsSync(`${path}.tsx`)) path += '.tsx'
    else if (existsSync(path) && statSync(path).isDirectory()) path = resolvePath(path, 'index.ts')
    if (existsSync(path)) return { shortCircuit: true, url: pathToFileURL(path).href }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (/\.tsx?$/.test(url)) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    return {
      shortCircuit: true,
      format: 'module',
      source: ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX
        }
      }).outputText
    }
  }
  return nextLoad(url, context)
}

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export function createLoader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = { exports: {} }; cache.set(file, loaded);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'module', 'exports', code)((name) => {
      if (name in overrides) return overrides[name];
      if (name.startsWith('@/')) return load(resolve('src', name.slice(2)) + '.ts');
      if (name.startsWith('.')) return load(resolve(dirname(file), name) + '.ts');
      return require(name);
    }, loaded, loaded.exports);
    return loaded.exports;
  }
  return load;
}

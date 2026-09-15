import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Run the actual game modules in node:test, including Vite aliases and parameter properties.
const root = new URL('../', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) specifier = new URL(`src/${specifier.slice(2)}`, root).href;
    if (specifier.startsWith('.') || specifier.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL ?? root);
      if (!url.pathname.endsWith('.ts') && existsSync(fileURLToPath(url) + '.ts')) specifier = url.href + '.ts';
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('.ts') || url.includes('/node_modules/')) return nextLoad(url, context);
    const source = readFileSync(new URL(url), 'utf8')
      .replaceAll('import.meta.env.DEV', 'false')
      .replaceAll('import.meta.env.BASE_URL', "'/'");
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      fileName: fileURLToPath(url),
    }).outputText };
  },
});

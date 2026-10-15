// Bundles web/main.ts into dist/ (ESM, minified, sourcemap) and copies the static files.
//   node web/build.mjs           one-shot build
//   node web/build.mjs --serve   dev server on :8000 with rebuild on change (no minify)
import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, rmSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const serve = process.argv.includes('--serve');
const port = Number(process.env.PORT ?? 8000);

const options = {
  entryPoints: [join(root, 'web/main.ts')],
  outfile: join(dist, 'app.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  minify: !serve,
  logLevel: 'info',
};

function copyStatic() {
  mkdirSync(dist, { recursive: true });
  for (const f of readdirSync(join(root, 'web'))) {
    if (f === 'index.html' || f.endsWith('.css')) copyFileSync(join(root, 'web', f), join(dist, f));
  }
}

if (!serve) {
  rmSync(dist, { recursive: true, force: true });
  copyStatic();
  await build(options);
} else {
  copyStatic();
  const ctx = await context(options);
  await ctx.watch();
  watch(join(root, 'web'), (_ev, f) => { if (f && (f === 'index.html' || f.endsWith('.css'))) copyStatic(); });
  const { hosts, port: p } = await ctx.serve({ servedir: dist, port });
  console.log(`serving dist/ at http://${hosts[0] ?? 'localhost'}:${p}/`);
}

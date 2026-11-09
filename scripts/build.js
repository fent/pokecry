import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const outDir = join(root, 'dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync(process.execPath, [require.resolve('typescript/bin/tsc')], {
  cwd: root,
  stdio: 'inherit',
});

cpSync(join(root, 'index.html'), join(outDir, 'index.html'));

for (const directory of ['media', 'style']) {
  cpSync(join(root, directory), join(outDir, directory), { recursive: true });
}

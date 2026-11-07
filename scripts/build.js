const { execFileSync } = require('node:child_process');
const { cpSync, mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');

const root = process.cwd();
const outDir = join(root, 'dist');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync(process.execPath, [require.resolve('typescript/bin/tsc')], {
  cwd: root,
  stdio: 'inherit',
});

cpSync(join(root, 'index.html'), join(outDir, 'index.html'));

for (const directory of ['data', 'media', 'style']) {
  cpSync(join(root, directory), join(outDir, directory), { recursive: true });
}

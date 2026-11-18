import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const tests = readdirSync(new URL('../tests/', import.meta.url)).filter(file => file.endsWith('.test.mjs')).sort();
for (const test of tests) {
  const result = spawnSync(process.execPath, ['tests/' + test], { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
  if (result.status !== 0) process.exit(result.status || 1);
}

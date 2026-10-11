// Local advisory evaluator; production extraction still goes through lib/extract.js.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../../../Project Brain/Company/Tools/Typesafe Trials/runner.mjs', import.meta.url));
const result = spawnSync(process.execPath, [runner, 'okolo', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) console.error('Unable to start the Project Brain TypeSafe trial runner.');
process.exitCode = result.status ?? 1;

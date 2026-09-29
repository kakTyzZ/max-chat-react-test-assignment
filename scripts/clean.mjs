import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(project, 'dist');
if (target !== path.join(project, 'dist') || !target.startsWith(project + path.sep)) {
  throw new Error('Refusing to clean outside the project.');
}
await rm(target, { recursive: true, force: true });

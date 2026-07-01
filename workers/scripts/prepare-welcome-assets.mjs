import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = path.join(root, 'src/public/ODiN.png');
const dest = path.join(root, 'src/public/welcome/ODiN.png');

fs.copyFileSync(src, dest);
console.log('Copied ODiN.png into welcome assets');

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const jsFiles = [];

function collectJavaScript(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') collectJavaScript(entryPath);
    if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(entryPath);
  }
}

collectJavaScript(path.join(root, 'js'));
jsFiles.push(path.join(root, 'sw.js'));
if (existsSync(path.join(root, 'public', 'sw.js'))) jsFiles.push(path.join(root, 'public', 'sw.js'));

for (const file of jsFiles) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

for (const file of ['db.json', 'manifest.webmanifest']) {
  JSON.parse(readFileSync(path.join(root, file), 'utf8'));
}

const htmlFiles = ['index.html', 'legacy.html', 'react.html'];
let htmlIdCount = 0;
for (const htmlFile of htmlFiles) {
  const html = readFileSync(path.join(root, htmlFile), 'utf8');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length)
    throw new Error(`Duplicate HTML ids in ${htmlFile}: ${[...new Set(duplicateIds)].join(', ')}`);
  htmlIdCount += ids.length;
}

for (const file of jsFiles.filter((entry) => entry.includes(`${path.sep}js${path.sep}`))) {
  const source = readFileSync(file, 'utf8');
  for (const match of source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    if (!existsSync(target)) throw new Error(`Missing import: ${file} -> ${match[1]}`);
  }
}

console.log(
  `Checks passed: ${jsFiles.length} JavaScript files, ${htmlIdCount} HTML ids, 2 JSON files.`,
);

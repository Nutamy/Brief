// Build: node build.mjs
// 1) compiles Tailwind into assets/brief.css
// 2) stamps content hashes into index.html (?v=…) so browsers always fetch fresh assets
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

execSync('npx --yes tailwindcss@3 -c tailwind.config.js -i src/brief.css -o assets/brief.css --minify', { stdio: 'inherit' });

const hash = f => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 10);
let html = readFileSync('index.html', 'utf8');
for (const f of ['assets/brief.css', 'assets/brief.js']) {
  const re = new RegExp('/' + f.replace('.', '\\.') + '\\?v=[\\w-]+', 'g');
  if (!re.test(html)) throw new Error('No versioned reference to /' + f + ' in index.html');
  html = html.replace(re, '/' + f + '?v=' + hash(f));
}
writeFileSync('index.html', html);
console.log('index.html stamped');

// Copies node icons (SVG) and codex metadata (.node.json) next to the compiled
// .node.js files in dist/. Plain Node script: keeps the package free of
// build-time dependencies (no gulp).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const dir of ['nodes', 'credentials']) {
  const src = path.join(root, dir);
  if (!fs.existsSync(src)) continue;
  for (const entry of fs.readdirSync(src, { recursive: true })) {
    const rel = String(entry);
    if (!rel.endsWith('.svg') && !rel.endsWith('.png') && !rel.endsWith('.node.json')) continue;
    const from = path.join(src, rel);
    const to = path.join(root, 'dist', dir, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    console.log(`[copy-icons] ${path.join(dir, rel)}`);
  }
}

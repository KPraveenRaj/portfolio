// Extract gzipped resources from the Claude Design bundler manifest in index.html
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const htmlPath = process.argv[2];
const outDir = process.argv[3];
const html = fs.readFileSync(htmlPath, 'utf8');

const m = html.match(/<script type="__bundler\/manifest">\s*\n([\s\S]*?)\n\s*<\/script>/);
if (!m) { console.error('manifest not found'); process.exit(1); }
const manifest = JSON.parse(m[1]);

fs.mkdirSync(outDir, { recursive: true });
for (const [id, res] of Object.entries(manifest)) {
  let data = Buffer.from(res.data, 'base64');
  if (res.compressed) data = zlib.gunzipSync(data);
  const ext = res.mime === 'text/javascript' ? '.js' : '.txt';
  const out = path.join(outDir, id + ext);
  fs.writeFileSync(out, data);
  console.log(id, res.mime, 'compressed=' + !!res.compressed, '->', out, data.length + ' bytes');
}

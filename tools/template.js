// Extract the __bundler/template HTML and the inline text/x-dc app source
const fs = require('fs');
const path = require('path');

const htmlPath = process.argv[2];
const outDir = process.argv[3];
const html = fs.readFileSync(htmlPath, 'utf8');

const m = html.match(/<script type="__bundler\/template">\s*\n([\s\S]*?)\n\s*<\/script>/);
if (!m) { console.error('template not found'); process.exit(1); }
const template = JSON.parse(m[1]); // JSON string -> real HTML

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'template.html'), template);

const dc = template.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
if (dc) {
  fs.writeFileSync(path.join(outDir, 'app.source.jsx'), dc[1]);
  console.log('app source:', dc[1].length, 'chars ->', path.join(outDir, 'app.source.jsx'));
} else {
  console.log('no text/x-dc script found; template length', template.length);
}

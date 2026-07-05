// Repack template.html into the __bundler/template block of index.html.
// Usage: node repack.js <template.html> <index.html> [--test]
//   --test  point the frontend at the production API (for local visual testing
//           of live-data mode; CORS is open on /api/steam)
const fs = require('fs');

const [tplPath, htmlPath, flag] = process.argv.slice(2);
let template = fs.readFileSync(tplPath, 'utf8');

if (flag === '--test') {
  template = template.replace(
    "fetch('/api/steam')",
    "fetch('https://portfolio.konatham-praveen-raj.workers.dev/api/steam')"
  );
  console.log('TEST build: fetch points at production API');
}

const html = fs.readFileSync(htmlPath, 'utf8');
const re = /(<script type="__bundler\/template">\s*\n)[\s\S]*?(\n\s*<\/script>)/;
if (!re.test(html)) { console.error('template block not found'); process.exit(1); }

// JSON-stringify, then escape "</script>" so the browser's HTML parser doesn't
// terminate the wrapper script tag early (matches the original export's encoding).
const encoded = JSON.stringify(template).split('</').join('<\\u002F');
fs.writeFileSync(htmlPath, html.replace(re, '$1' + encoded + '$2'));
console.log('repacked', encoded.length, 'chars into', htmlPath);

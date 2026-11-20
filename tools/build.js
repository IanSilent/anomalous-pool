// Builds one self-contained HTML file for sharing: CSS and every script inlined.
//   node tools/build.js   →   dist/anomalous-pool.html
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, function (m, href) {
  return '<style>\n' + fs.readFileSync(path.join(root, href), 'utf8') + '\n</style>';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) {
  var js = fs.readFileSync(path.join(root, src), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '<script>\n' + js + '\n</script>';
});

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
var out = path.join(root, 'dist', 'anomalous-pool.html');
fs.writeFileSync(out, html);
console.log(out + ' (' + Math.round(html.length / 1024) + ' KB)');

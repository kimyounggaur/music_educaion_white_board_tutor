import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const pkg = JSON.parse(read('package.json'));
const debug = process.argv.includes('--debug');
const notices = 'Gaegu Bold\n' + read('licenses/OFL-Gaegu.txt');
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  legalComments: 'none',
  minify: !debug,
  write: false,
  plugins: [{
    name: 'build-info',
    setup(context) {
      context.onLoad({ filter: /[/\\]build-info\.js$/ }, () => ({
        contents: 'export const appVersion = ' + JSON.stringify(pkg.version) + ';export const licenseNotices = ' + JSON.stringify(notices) + ';',
        loader: 'js',
      }));
    },
  }],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const font = readFileSync(resolve(root, 'assets/Gaegu-Bold.woff2')).toString('base64');
const fontCss = '@font-face{font-family:WhiteboardHand;src:url(data:font/woff2;base64,' + font + ') format("woff2");font-style:normal;font-weight:700;font-display:swap;}';
const css = fontCss + ['src/style.css', 'src/ui/editor-style.css', 'src/ui/scene-list-style.css'].map(read).join('\n');
const hash = value => createHash('sha256').update(value).digest('base64');
const policy = [
  "default-src 'none'", "script-src 'sha256-" + hash(js) + "'", "style-src 'sha256-" + hash(css) + "'",
  'font-src data:', "img-src 'self' data: blob:", "connect-src 'none'", "object-src 'none'",
  "base-uri 'none'", "form-action 'none'",
].join('; ');
const html = read('src/index.html')
  .replace('<!--__CSP__-->', '<meta http-equiv="Content-Security-Policy" content="' + policy + '">')
  .replace('/*__STYLE__*/', () => css)
  .replace('/*__SCRIPT__*/', () => js);
mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/index.html'), html);
console.log('dist/index.html · ' + Buffer.byteLength(html).toLocaleString('en-US') + ' bytes');

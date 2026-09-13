// 一次性下载 Google Fonts 完整字体到本地（含 unicode-range 切片，未用到的切片浏览器不会请求）
// 用法：node scripts/fetch-fonts.cjs
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CSS_URL = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap';
const ROOT = path.resolve(__dirname, '..');
const FILES_DIR = path.join(ROOT, 'fonts', 'files');
const OUT_CSS = path.join(ROOT, 'fonts', 'fonts.css');

async function main() {
  const res = await fetch(CSS_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error('CSS fetch failed: ' + res.status);
  let css = await res.text();
  const urls = [...new Set([...css.matchAll(/url\((https:\/\/[^)]+)\)/g)].map(m => m[1]))];
  console.log('font files referenced:', urls.length);

  fs.mkdirSync(FILES_DIR, { recursive: true });
  let done = 0, failed = 0, bytes = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      const name = url.split('/').pop(); // 形如 notosanssc-v15-...woff2，本身含家族与哈希，不会互相覆盖
      const dest = path.join(FILES_DIR, name);
      css = css.split(url).join('files/' + name);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { done++; bytes += fs.statSync(dest).size; continue; }
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFileSync(dest, buf);
        done++; bytes += buf.length;
        if (done % 100 === 0) console.log(`  ${done}/${urls.length}...`);
      } catch (e) {
        failed++;
        console.error('FAIL', url, e.message);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  // swap → optional：消除刷新时回退字体先画一帧再切换的闪变（FOUT）
  css = css.replace(/font-display:\s*swap/g, 'font-display: optional');
  fs.writeFileSync(OUT_CSS, css);
  console.log(`downloaded: ${done}, failed: ${failed}, total: ${(bytes / 1048576).toFixed(1)} MB`);
  console.log('css written:', OUT_CSS);
  if (failed) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });

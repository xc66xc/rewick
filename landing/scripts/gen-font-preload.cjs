// 计算首屏关键文字（导航/眉标/h1/首屏段落/按钮/芯片）命中的字体切片，输出 preload 标签
// 用法：node scripts/gen-font-preload.cjs   （改了首屏文案后重跑，替换 index.html 里的 preload 块）
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'fonts', 'fonts.css'), 'utf8');
const blocks = [...css.matchAll(/@font-face\s*{([^}]+)}/g)].map(m => m[1]).map(b => ({
  family: (b.match(/font-family:\s*'([^']+)'/) || [])[1],
  weight: (b.match(/font-weight:\s*(\d+)/) || [])[1],
  file: (b.match(/url\(([^)]+)\)/) || [])[1],
  ranges: ((b.match(/unicode-range:\s*([^;}]+)/) || [])[1] || '')
    .split(',').map(r => r.replace(/U\+/i, '').trim()).filter(Boolean)
    .map(r => r.split('-').map(h => parseInt(h, 16))),
}));

// 首屏关键文字：导航、眉标、h1、首屏段落、按钮、平台芯片
const CRITICAL_SANS = '掌灯产品能力使用流程回答透明下载免费下载每一场面试，都重新点亮。桌面客户端在本地采集系统音频、实时转写，结合你的简历、目标岗位与参考资料给出可以直接说出口的回答；每条回答都能看到发送给模型的完整内容。查看使用教程及以上';
const CRITICAL_MONO = 'REWICK DESKTOP CLIENT';
// 首屏拉丁文字（sans 渲染）：Windows 10 / macOS 12 等
const CRITICAL_LATIN = 'Windows 10 macOS 12';

const covers = (ranges, cp) => ranges.some(([a, b]) => cp >= a && cp <= (b || a));
const files = { sans: new Set(), mono: new Set() };

for (const ch of new Set((CRITICAL_SANS + CRITICAL_LATIN).split(''))) {
  const cp = ch.codePointAt(0);
  for (const b of blocks) if (b.family === 'Noto Sans SC' && covers(b.ranges, cp)) { files.sans.add(b.file); break; }
}
// Plex 按字重分文件，首屏用到 400（REWICK/时间戳风格）、600（眉标）、700（徽标）
for (const ch of new Set(CRITICAL_MONO.split(''))) {
  const cp = ch.codePointAt(0);
  for (const b of blocks) if (b.family === 'IBM Plex Mono' && ['400', '600', '700'].includes(b.weight) && covers(b.ranges, cp)) files.mono.add(b.file);
}

const tags = [...files.sans, ...files.mono]
  .map(f => `<link rel="preload" href="fonts/${f}" as="font" type="font/woff2" crossorigin />`)
  .sort();
console.log(`sans 切片 ${files.sans.size} 个 + mono 切片 ${files.mono.size} 个`);
const total = [...files.sans, ...files.mono].reduce((s, f) => s + fs.statSync(path.join(__dirname, '..', 'fonts', f)).size, 0);
console.log(`合计 ${(total / 1024).toFixed(0)} KB`);
console.log(tags.join('\n'));

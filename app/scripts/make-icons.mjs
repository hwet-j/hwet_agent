// 앱 아이콘 PNG 생성: node scripts/make-icons.mjs  (필요: playwright — npm i --no-save playwright)
// 디자인을 바꾸려면 아래 SVG 만 고치고 다시 실행한 뒤, 생성된 assets/images/*.png 를 커밋한다.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/images');

const GRAD = ['#4F46E5', '#2563EB']; // 인디고 → 블루
const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRAD[0]}"/><stop offset="1" stop-color="${GRAD[1]}"/></linearGradient>
  <linearGradient id="sp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GRAD[0]}"/><stop offset="1" stop-color="${GRAD[1]}"/></linearGradient>
</defs>`;

// 말풍선(꼬리 왼쪽 아래) — 둥근 이음새를 위해 같은 색 외곽선을 둔다
const bubblePath = 'M382 262H642A150 150 0 0 1 792 412V532A150 150 0 0 1 642 682H500L330 812L392 682H382A150 150 0 0 1 232 532V412A150 150 0 0 1 382 262Z';
const sparkle = 'M512 352C524 432 552 460 632 472C552 484 524 512 512 592C500 512 472 484 392 472C472 460 500 432 512 352Z';
const small = 'translate(676 376) scale(.3) translate(-512 -472)';

/** 말풍선 + 반짝이. 말풍선 높이가 한쪽으로 쏠려 있어 y 를 -25 올려 가운데로 맞춘다. */
const glyph = ({ bubble = '#fff', spark = 'url(#sp)', cut = false, color = '#000' } = {}) => {
  if (cut) {
    // 단색 아이콘(Android 테마 아이콘·알림): 반짝이 부분을 뚫는다
    return `<g transform="translate(0 -25)"><mask id="m"><rect width="1024" height="1100" fill="#fff"/><path d="${sparkle}" fill="#000"/><path d="${sparkle}" transform="${small}" fill="#000"/></mask>
      <path d="${bubblePath}" fill="${color}" stroke="${color}" stroke-width="28" stroke-linejoin="round" mask="url(#m)"/></g>`;
  }
  return `<g transform="translate(0 -25)"><path d="${bubblePath}" fill="${bubble}" stroke="${bubble}" stroke-width="28" stroke-linejoin="round"/>
    <path d="${sparkle}" fill="${spark}"/><path d="${sparkle}" transform="${small}" fill="${spark}"/></g>`;
};

const svg = (size, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${defs}${inner}</svg>`;
const bgRect = '<rect width="1024" height="1024" fill="url(#bg)"/>';

const files = {
  'icon.png': { size: 1024, svg: svg(1024, bgRect + glyph()), opaque: true },
  'android-icon-background.png': { size: 1024, svg: svg(1024, bgRect), opaque: true },
  'android-icon-foreground.png': { size: 1024, svg: svg(1024, glyph()) },
  'android-icon-monochrome.png': { size: 1024, svg: svg(1024, glyph({ cut: true })) },
  // 스플래시/시작 화면: 인디고 배경 위에 얹으므로 흰 말풍선 + 인디고 반짝이, 여백을 넉넉히
  'splash-icon.png': { size: 512, svg: svg(512, glyph({ spark: GRAD[0] })) },
  'favicon.png': { size: 48, svg: svg(48, bgRect + glyph()), opaque: true },
  // 알림 작은 아이콘: 흰색 단색 + 투명 (Android 가 색을 입힌다)
  'notification-icon.png': { size: 96, svg: svg(96, glyph({ cut: true, color: '#fff' })) },
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, f] of Object.entries(files)) {
  await page.setViewportSize({ width: f.size, height: f.size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${f.svg}</body></html>`);
  const buf = await page.screenshot({ omitBackground: !f.opaque, clip: { x: 0, y: 0, width: f.size, height: f.size } });
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('wrote', name, f.size);
}
await browser.close();

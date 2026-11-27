// 앱 아이콘 PNG 생성: node scripts/make-icons.mjs  (필요: playwright — npm i --no-save playwright)
// 디자인을 바꾸려면 아래 SVG 만 고치고 다시 실행한 뒤, 생성된 assets/images/*.png 를 커밋한다.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/images');

const BG = ['#0B5F57', '#19B7A5']; // 짙은 청록 → 밝은 청록
const defs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BG[0]}"/><stop offset="1" stop-color="${BG[1]}"/></linearGradient>
  <linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E6F6F3"/></linearGradient>
</defs>`;

// 할 일 카드: 둥근 사각형 + 3줄 체크리스트(첫 줄은 완료) + 오른쪽 위 알림 점
const CARD = { x: 290, y: 250, w: 440, h: 524, r: 70 };
const rows = [398, 512, 626];

const checkPath = 'M370 398L388 418L424 376'; // 첫 줄 체크 표시

/** mono=true: 한 가지 색(알림 아이콘·테마 아이콘). 카드에서 줄과 원을 뚫어 윤곽만 남긴다 */
const glyph = ({ mono = false, color = '#000' } = {}) => {
  if (mono) {
    const holes = rows.map((y, i) => `<circle cx="392" cy="${y}" r="40" fill="#000"/><rect x="468" y="${y - 15}" width="${i === 0 ? 212 : i === 1 ? 180 : 150}" height="30" rx="15" fill="#000"/>`).join('');
    return `<g><mask id="m"><rect width="1024" height="1024" fill="#fff"/>${holes}<circle cx="728" cy="290" r="84" fill="#000"/></mask>
      <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="${color}" mask="url(#m)"/>
      <path d="${checkPath}" fill="none" stroke="${color}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="728" cy="290" r="58" fill="${color}"/></g>`;
  }
  const lines = rows.map((y, i) =>
    (i === 0
      ? '<circle cx="392" cy="' + y + '" r="40" fill="#0E9F8E"/>' + `<path d="${checkPath}" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<circle cx="392" cy="${y}" r="40" fill="none" stroke="#A9DAD3" stroke-width="14"/>`) +
    `<rect x="468" y="${y - 15}" width="${i === 0 ? 212 : i === 1 ? 180 : 150}" height="30" rx="15" fill="${i === 0 ? '#0B5F57' : '#C4E6E1'}"/>`).join('');
  return `<g>
    <rect x="${CARD.x}" y="${CARD.y + 14}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="#000" opacity=".16"/>
    <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="${CARD.r}" fill="url(#card)"/>
    ${lines}
    <circle cx="728" cy="290" r="76" fill="#FF6B57" stroke="#fff" stroke-width="22"/></g>`;
};

const svg = (size, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${defs}${inner}</svg>`;
const bgRect = '<rect width="1024" height="1024" fill="url(#bg)"/>';

const files = {
  'icon.png': { size: 1024, svg: svg(1024, bgRect + glyph()), opaque: true },
  'android-icon-background.png': { size: 1024, svg: svg(1024, bgRect), opaque: true },
  'android-icon-foreground.png': { size: 1024, svg: svg(1024, glyph()) },
  'android-icon-monochrome.png': { size: 1024, svg: svg(1024, glyph({ mono: true })) },
  // 스플래시: 청록 배경(app.json) 위에 얹으므로 배경 없이 카드만
  'splash-icon.png': { size: 512, svg: svg(512, glyph()) },
  'favicon.png': { size: 48, svg: svg(48, bgRect + glyph()), opaque: true },
  // 알림 작은 아이콘: 흰색 단색 + 투명 (Android 가 색을 입힌다)
  'notification-icon.png': { size: 96, svg: svg(96, glyph({ mono: true, color: '#fff' })) },
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

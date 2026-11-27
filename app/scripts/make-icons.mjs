// 앱 아이콘 PNG 생성: node scripts/make-icons.mjs  (필요: playwright — npm i --no-save playwright)
// 디자인을 바꾸려면 아래 SVG 만 고치고 다시 실행한 뒤, 생성된 assets/images/*.png 를 커밋한다.
// 디자인: 남색 무대 + 금빛 조명 아래 실로 매달린 신사 꼭두각시(실크햇·연미복·금 장식).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../assets/images');

const defs = `<defs>
  <radialGradient id="bg" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#26356E"/><stop offset=".6" stop-color="#111A3E"/><stop offset="1" stop-color="#070B22"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFEFB8"/><stop offset=".45" stop-color="#E2B04F"/><stop offset="1" stop-color="#9A6A1C"/></linearGradient>
  <linearGradient id="goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFEFB8"/><stop offset=".5" stop-color="#E2B04F"/><stop offset="1" stop-color="#A5741F"/></linearGradient>
  <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="coat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0E1634"/><stop offset=".5" stop-color="#1D2A5B"/><stop offset="1" stop-color="#0E1634"/></linearGradient>
</defs>`;
const skin = '#FBE9CF';

// 무대 배경(남색 + 조명 + 바닥 링)
const stage = `<rect width="1024" height="1024" fill="url(#bg)"/><polygon points="380,170 644,170 840,960 184,960" fill="url(#cone)"/>
  <ellipse cx="512" cy="884" rx="230" ry="34" fill="#000" opacity=".35"/><ellipse cx="512" cy="878" rx="190" ry="22" fill="none" stroke="url(#gold)" stroke-width="4" opacity=".7"/>`;

// 인형 본체 (조종대 + 실 + 신사). sw = 실 굵기(작은 아이콘에서는 굵게)
const puppet = (sw = 5) => `
  <g stroke="#F0D08A" stroke-width="${sw}" stroke-linecap="round" opacity=".92"><line x1="512" y1="210" x2="512" y2="268"/><line x1="272" y1="190" x2="352" y2="592"/><line x1="752" y1="190" x2="672" y2="592"/></g>
  <rect x="244" y="160" width="536" height="34" rx="17" fill="url(#gold)"/><circle cx="244" cy="177" r="22" fill="url(#gold)"/><circle cx="780" cy="177" r="22" fill="url(#gold)"/><rect x="494" y="148" width="36" height="76" rx="18" fill="url(#goldv)"/>
  <g stroke="url(#coat)" stroke-width="40" stroke-linecap="round"><line x1="452" y1="528" x2="352" y2="612"/><line x1="572" y1="528" x2="672" y2="612"/></g>
  <circle cx="348" cy="618" r="26" fill="${skin}"/><circle cx="676" cy="618" r="26" fill="${skin}"/>
  <rect x="466" y="730" width="42" height="116" rx="20" fill="#0E1634"/><rect x="516" y="730" width="42" height="116" rx="20" fill="#0E1634"/>
  <ellipse cx="480" cy="850" rx="38" ry="15" fill="url(#gold)"/><ellipse cx="548" cy="850" rx="38" ry="15" fill="url(#gold)"/>
  <path d="M436 508Q512 486 588 508L612 760L552 700L512 770L472 700L412 760Z" fill="url(#coat)"/>
  <path d="M486 504L512 600L538 504Z" fill="#fff"/><path d="M512 512L470 494V530ZM512 512L554 494V530Z" fill="url(#gold)"/><circle cx="512" cy="512" r="11" fill="url(#gold)"/>
  <circle cx="512" cy="566" r="7" fill="url(#gold)"/><circle cx="512" cy="598" r="7" fill="url(#gold)"/><circle cx="512" cy="630" r="7" fill="url(#gold)"/>
  <circle cx="512" cy="416" r="78" fill="${skin}"/><ellipse cx="512" cy="352" rx="116" ry="20" fill="#0B1020"/><rect x="452" y="262" width="120" height="96" rx="12" fill="#0B1020"/><rect x="452" y="326" width="120" height="20" fill="url(#gold)"/>
  <circle cx="484" cy="420" r="9" fill="#1A2040"/><circle cx="540" cy="420" r="9" fill="#1A2040"/><path d="M478 450Q512 474 546 450" fill="none" stroke="#1A2040" stroke-width="9" stroke-linecap="round"/>`;

/** 단색 실루엣 (Android 테마 아이콘·알림 작은 아이콘). 알파만 남기고 지정한 색으로 칠한다 */
const silhouette = (rgb, sw) => `<filter id="sil"><feColorMatrix type="matrix" values="0 0 0 0 ${rgb[0]} 0 0 0 0 ${rgb[1]} 0 0 0 0 ${rgb[2]} 0 0 0 1 0"/></filter>
  <g filter="url(#sil)">${puppet(sw)}</g>`;

/** 적응형 아이콘 전경: 안전 영역(가운데 66%)에 들어가도록 중심 기준으로 줄인다 */
const fit = (inner, k = 0.84) => `<g transform="translate(512 512) scale(${k}) translate(-512 -520)">${inner}</g>`;

const svg = (size, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${defs}${inner}</svg>`;

const files = {
  'icon.png': { size: 1024, svg: svg(1024, stage + puppet()), opaque: true },
  'android-icon-background.png': { size: 1024, svg: svg(1024, stage), opaque: true },
  'android-icon-foreground.png': { size: 1024, svg: svg(1024, fit(puppet())) },
  'android-icon-monochrome.png': { size: 1024, svg: svg(1024, fit(silhouette([0, 0, 0], 9))) },
  // 스플래시: 남색 배경(app.json) 위에 얹으므로 배경 없이 인형만
  'splash-icon.png': { size: 512, svg: svg(512, puppet(7)) },
  'favicon.png': { size: 48, svg: svg(48, stage + puppet(12)), opaque: true },
  // 알림 작은 아이콘: 흰색 단색 + 투명 (Android 가 색을 입힌다)
  'notification-icon.png': { size: 96, svg: svg(96, silhouette([1, 1, 1], 14)) },
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

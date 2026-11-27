/** 기기 앱 실행(앱 이름 찾기, 음악·길 안내 링크, 타이머·알람 값 검증)의 순수 로직. 앱 목록은 기기 밖으로 보내지 않고 여기서만 쓴다. */
export type App = { label: string; package: string };

export const normalizeName = (s: string) => s.toLowerCase().replace(/[\s\-_.·()[\]]/g, '');

/** 흔한 별칭: 사용자가 부르는 이름 → 앱 이름에 들어 있을 만한 표기들(정규화된 형태) */
const ALIASES: Record<string, string[]> = {
  유튜브: ['youtube'], 유튜브뮤직: ['youtubemusic'], 카톡: ['카카오톡', 'kakaotalk'], 카카오: ['카카오톡', 'kakaotalk'],
  티맵: ['tmap', 'tmapt맵', 't맵'], 네이버: ['naver'], 네이버지도: ['navermap', 'naver지도'], 카카오맵: ['kakaomap', '카카오맵'],
  카카오내비: ['kakaonavi', '카카오내비'], 크롬: ['chrome'], 카메라: ['camera'], 갤러리: ['gallery', 'photos', '사진'], 설정: ['settings'],
  계산기: ['calculator'], 시계: ['clock'], 캘린더: ['calendar'], 지도: ['maps', 'map'], 구글지도: ['maps'], 문자: ['messages', 'message', '메시지'],
  전화: ['phone', 'dialer'], 멜론: ['melon'], 스포티파이: ['spotify'], 지니: ['genie', '지니뮤직'], 플로: ['flo'], 바이브: ['vibe'],
  넷플릭스: ['netflix'], 쿠팡: ['coupang'], 배민: ['배달의민족', 'baemin'], 토스: ['toss'], 인스타: ['instagram'], 인스타그램: ['instagram'],
  페북: ['facebook'], 트위터: ['twitter', 'x'], 지메일: ['gmail'], 메일: ['gmail', 'mail'], 드라이브: ['drive'], 번역: ['translate'], 파파고: ['papago'],
};

export type Match = { app: App; score: number };

/** 앱 이름(사용자 표현)과 가장 비슷한 설치된 앱들 (점수순). 80 이상이면 거의 확실 */
export function matchApps(apps: App[], query: string, limit = 5): Match[] {
  const q = normalizeName(query);
  if (!q) return [];
  const terms = [q, ...(ALIASES[q] ?? []).map(normalizeName)];
  const scored: Match[] = [];
  for (const app of apps) {
    const l = normalizeName(app.label);
    let score = 0;
    for (const [i, t] of terms.entries()) {
      const bonus = i === 0 ? 0 : -3; // 별칭은 아주 조금 낮게
      if (l === t) score = Math.max(score, 100 + bonus);
      else if (l.startsWith(t)) score = Math.max(score, 80 + bonus - Math.min(l.length - t.length, 10));
      else if (l.includes(t) && t.length >= 2) score = Math.max(score, 55 + bonus - Math.min(l.length - t.length, 10));
    }
    if (score > 0) scored.push({ app, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.app.label.localeCompare(b.app.label)).slice(0, limit);
}

/** 확실히 한 개로 정해지면 그 앱, 아니면 후보 목록 */
export function resolveApp(apps: App[], query: string): { app: App } | { candidates: App[] } | { none: true } {
  const m = matchApps(apps, query);
  if (!m.length) return { none: true };
  if (m[0].score >= 80 && (m.length === 1 || m[0].score - m[1].score >= 10)) return { app: m[0].app };
  if (m.length === 1 && m[0].score >= 55) return { app: m[0].app };
  return { candidates: m.map((x) => x.app) };
}

// ---- 음악
export const MUSIC_APPS: { package: string; name: string }[] = [
  { package: 'com.google.android.apps.youtube.music', name: '유튜브 뮤직' },
  { package: 'com.spotify.music', name: '스포티파이' },
  { package: 'com.iloen.melon', name: '멜론' },
  { package: 'com.ktmusic.geniemusic', name: '지니뮤직' },
  { package: 'skplanet.musicmate', name: 'FLO' },
  { package: 'com.naver.vibe', name: 'VIBE' },
  { package: 'com.samsung.android.app.music.chn', name: '삼성 뮤직' },
];

/** 사용자가 앱을 말했으면 그 앱, 아니면 설치된 음악 앱 중 우선순위가 높은 것. 없으면 null(기기가 고르게 둠) */
export function pickMusicApp(apps: App[], prefer?: string): App | null {
  if (prefer) {
    const r = resolveApp(apps, prefer);
    return 'app' in r ? r.app : null;
  }
  for (const m of MUSIC_APPS) {
    const a = apps.find((x) => x.package === m.package);
    if (a) return a;
  }
  return null;
}

export const youtubeSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

// ---- 길 안내
export type NavTarget = { id: string; name: string; package: string; url: (dest: string) => string };
const ENC = encodeURIComponent;
export const NAV_TARGETS: NavTarget[] = [
  { id: 'tmap', name: '티맵', package: 'com.skt.tmap.ku', url: (d) => `tmap://search?name=${ENC(d)}` },
  { id: 'kakaomap', name: '카카오맵', package: 'net.daum.android.map', url: (d) => `kakaomap://search?q=${ENC(d)}` },
  { id: 'naver', name: '네이버 지도', package: 'com.nhn.android.nmap', url: (d) => `nmap://search?query=${ENC(d)}&appname=com.hwetj.assistant` },
  { id: 'google', name: '구글 지도', package: 'com.google.android.apps.maps', url: (d) => `google.navigation:q=${ENC(d)}` },
];
export const geoUrl = (d: string) => `geo:0,0?q=${ENC(d)}`;

/** 설치된 지도·내비 앱을 우선순위(또는 사용자가 말한 앱)대로 */
export function pickNavTargets(apps: App[], prefer?: string): NavTarget[] {
  const have = NAV_TARGETS.filter((t) => apps.some((a) => a.package === t.package));
  if (!prefer) return have;
  const p = normalizeName(prefer);
  const hit = have.filter((t) => normalizeName(t.name).includes(p) || t.id.includes(p) || p.includes(t.id) || (p.includes('카카오') && t.id === 'kakaomap') || (p.includes('네이버') && t.id === 'naver') || (p.includes('구글') && t.id === 'google'));
  return hit.length ? hit : have;
}

// ---- 입력 검증
export function parseDestination(v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error('목적지를 알려 주세요');
  const d = v.trim();
  if (d.length > 120) throw new Error('목적지가 너무 길어요');
  return d;
}

export function timerSeconds(i: { seconds?: unknown; minutes?: unknown; hours?: unknown }): number {
  const num = (v: unknown, name: string) => {
    if (v == null) return 0;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`${name} 값이 올바르지 않아요`);
    return v;
  };
  const total = Math.round(num(i.seconds, 'seconds') + num(i.minutes, 'minutes') * 60 + num(i.hours, 'hours') * 3600);
  if (total < 1) throw new Error('타이머 시간을 알려 주세요');
  if (total > 24 * 3600) throw new Error('타이머는 최대 24시간까지예요');
  return total;
}

const DAY_NUM: Record<string, number> = { sun: 1, mon: 2, tue: 3, wed: 4, thu: 5, fri: 6, sat: 7 };
export function alarmArgs(i: { time?: unknown; days?: unknown; label?: unknown }): { hour: number; minute: number; days: number[] | null; label: string | null } {
  const m = typeof i.time === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(i.time.trim()) : null;
  if (!m) throw new Error('time 은 HH:MM(24시간) 형식이어야 해요');
  const hour = +m[1], minute = +m[2];
  if (hour > 23 || minute > 59) throw new Error('시각이 올바르지 않아요');
  let days: number[] | null = null;
  if (i.days != null) {
    if (!Array.isArray(i.days) || i.days.length > 7) throw new Error('days 는 mon~sun 배열이어야 해요');
    const set = new Set<number>();
    for (const d of i.days) {
      const n = DAY_NUM[String(d).toLowerCase().slice(0, 3)];
      if (!n) throw new Error(`알 수 없는 요일: ${String(d)}`);
      set.add(n);
    }
    days = [...set].sort((a, b) => a - b);
  }
  const label = typeof i.label === 'string' && i.label.trim() ? i.label.trim().slice(0, 60) : null;
  return { hour, minute, days: days && days.length ? days : null, label };
}

export function volumeArgs(i: { percent?: unknown; direction?: unknown }, current: number): number {
  if (i.percent != null) {
    if (typeof i.percent !== 'number' || !Number.isFinite(i.percent) || i.percent < 0 || i.percent > 100) throw new Error('percent 는 0~100 이어야 해요');
    return Math.round(i.percent);
  }
  if (i.direction === 'up') return Math.min(100, current + 10);
  if (i.direction === 'down') return Math.max(0, current - 10);
  throw new Error('percent 또는 direction(up/down)이 필요해요');
}

/** https 만, 자격 증명(user:pass@) 금지 */
export function safeHttpsUrl(v: unknown): string {
  if (typeof v !== 'string') throw new Error('url 이 필요해요');
  const u = v.trim();
  if (u.length > 2000 || !/^https:\/\/[^\s]+$/i.test(u)) throw new Error('https:// 로 시작하는 주소만 열 수 있어요');
  const host = u.slice(8).split(/[/?#]/)[0];
  if (host.includes('@')) throw new Error('주소에 계정 정보(@)가 들어 있어요');
  return u;
}

export function dialNumber(v: unknown): string {
  if (typeof v !== 'string') throw new Error('전화번호가 필요해요');
  const n = v.replace(/[\s\-().]/g, '');
  if (!/^\+?\d{3,15}$/.test(n)) throw new Error('전화번호 형식이 올바르지 않아요');
  return n;
}

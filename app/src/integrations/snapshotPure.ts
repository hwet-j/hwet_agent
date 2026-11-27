/**
 * 앱(LeaseLog·캘린더)이 ContentProvider 로 내놓는 읽기 전용 스냅샷에서 질문에 맞는 부분을 고른다.
 * 앱을 열지 않고 읽으므로 "앱이 마지막으로 스냅샷을 만든 시각" 기준이다 (asOf).
 */
export type Snapshot = { v: number; app: 'leaselog' | 'calendar'; ts: number; data?: Record<string, any>; [k: string]: any };

export const STALE_MS = 24 * 3600_000;
const MAX_ITEMS = 150;

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const ym = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const localIso = (t: number) => {
  const d = new Date(t);
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 원시 응답(JSON 문자열) → 검증된 스냅샷. 앱 종류가 다르거나 형식이 틀리면 null */
export function parseSnapshot(json: string | null | undefined, app: Snapshot['app']): Snapshot | null {
  if (typeof json !== 'string' || json.length > 2_000_000) return null;
  try {
    const s = JSON.parse(json);
    if (!s || typeof s !== 'object' || s.v !== 1 || s.app !== app || typeof s.ts !== 'number') return null;
    return s as Snapshot;
  } catch {
    return null;
  }
}

export type Picked = { ok: true; data: unknown; asOf: string; stale: boolean; note?: string } | { ok: false; reason: 'missing'; detail: string };

const freshness = (snap: Snapshot, now: number) => ({ asOf: localIso(snap.ts), stale: now - snap.ts > STALE_MS });

export function pickLeaselog(snap: Snapshot, input: { what?: unknown; year?: unknown; month?: unknown }, now: number = Date.now()): Picked {
  const d = snap.data ?? {};
  const f = freshness(snap, now);
  const today = new Date(now);
  switch (input.what) {
    case 'overview':
    case 'unpaid':
    case 'rooms':
    case 'tenants':
      return d[input.what as string] != null ? { ok: true, data: d[input.what as string], ...f } : { ok: false, reason: 'missing', detail: `${input.what} 가 스냅샷에 없어요` };
    case 'income': {
      const year = typeof input.year === 'number' ? input.year : today.getFullYear();
      const v = d.income?.[String(year)];
      if (v != null) return { ok: true, data: v, ...f };
      return { ok: false, reason: 'missing', detail: `${year}년 수입 데이터가 스냅샷에 없어요 (있는 연도: ${Object.keys(d.income ?? {}).join(', ') || '없음'})` };
    }
    case 'payments': {
      const month = typeof input.month === 'string' ? input.month : ym(today);
      const v = d.payments?.[month];
      if (v != null) return { ok: true, data: v, ...f };
      // 스냅샷에 없는 달은 입금 내역이 없는 달일 수 있다 (앱은 입금이 있는 달만 담음)
      const known = Object.keys(d.payments ?? {}).sort();
      if (known.length && month >= known[0] && month <= known[known.length - 1]) {
        return { ok: true, data: { items: [] }, ...f, note: `${month} 에는 입금 내역이 없어요` };
      }
      return { ok: false, reason: 'missing', detail: `${month} 입금 내역이 스냅샷 범위 밖이에요` };
    }
    default:
      return { ok: false, reason: 'missing', detail: '알 수 없는 조회 종류예요' };
  }
}

/** 캘린더 스냅샷에서 [from, to] (YYYY-MM-DD, 양 끝 포함) 에 걸치는 일정 */
export function pickCalendar(snap: Snapshot, input: { from?: unknown; to?: unknown }, now: number = Date.now()): Picked {
  const f = freshness(snap, now);
  const today = new Date(now);
  const from = typeof input.from === 'string' ? input.from : ymd(today);
  const to = typeof input.to === 'string' ? input.to : ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14));
  const wFrom: string = snap.from, wTo: string = snap.to;
  if (typeof wFrom === 'string' && typeof wTo === 'string' && (from < wFrom || to > wTo)) {
    return { ok: false, reason: 'missing', detail: `요청 기간이 스냅샷 범위(${wFrom} ~ ${wTo}) 밖이에요` };
  }
  const events: any[] = Array.isArray(snap.events) ? snap.events : [];
  // 시간 일정은 'YYYY-MM-DDTHH:mm', 종일 일정은 'YYYY-MM-DD' (종료는 마지막 날 포함)
  const startDay = (e: any) => String(e.start).slice(0, 10);
  const endDay = (e: any) => String(e.end).slice(0, 10);
  const hit = events.filter((e) => startDay(e) <= to && endDay(e) >= from);
  return {
    ok: true,
    data: { from, to, count: hit.length, truncated: hit.length > MAX_ITEMS, events: hit.slice(0, MAX_ITEMS) },
    ...f,
  };
}

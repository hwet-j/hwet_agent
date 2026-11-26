/** 네트워크·RN 의존성이 없는 순수 함수들 (Node 에서 단독 테스트 가능). */

const opt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** calendar 앱(com.hwetj.calendar)의 딥링크. 앱이 값을 채운 새 일정 화면을 열고, 저장은 사용자가 누른다. */
export function buildCalendarDeepLink(i: Record<string, unknown>): string {
  const q: [string, string][] = [];
  for (const k of ['title', 'start', 'end', 'location', 'notes'] as const) {
    const v = opt(i[k]);
    if (v) q.push([k, v]);
  }
  if (i.allDay === true) q.push(['allDay', '1']);
  const qs = q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `calendarapp://event/new${qs ? `?${qs}` : ''}`;
}

export type NewEvent = {
  title: string;
  start: string;
  end?: string;
  allDay?: boolean;
  location?: string;
  notes?: string;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const parse = (v: unknown, field: string): Date => {
  const d = typeof v === 'string' ? new Date(v) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} 가 올바른 날짜/시각이 아니에요: ${String(v)}`);
  return d;
};

/** "2026-11-27T15:00" 처럼 초가 없으면 RFC3339 에 맞게 초를 붙인다. */
const withSeconds = (s: string) => (/T\d{2}:\d{2}$/.test(s) ? `${s}:00` : s);

const addDay = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** YYYY-MM-DD 그대로이거나, 다른 형식이면 "현지 날짜"로 환산한다 (UTC 로 바꾸면 날짜가 밀릴 수 있다). */
const localYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toYmd = (v: string, field: string) => (DATE_ONLY.test(v) ? v : localYmd(parse(v, field)));

/** 구글 Calendar API 의 events.insert 본문을 만든다. */
export function buildEventBody(e: NewEvent, timeZone: string): Record<string, unknown> {
  const title = typeof e.title === 'string' ? e.title.trim().slice(0, 200) : '';
  if (!title) throw new Error('title 이 필요해요');
  const body: Record<string, unknown> = { summary: title };
  if (e.location) body.location = String(e.location).slice(0, 200);
  if (e.notes) body.description = String(e.notes).slice(0, 2000);

  if (e.allDay) {
    const s = toYmd(e.start, 'start');
    const endIncl = e.end ? toYmd(e.end, 'end') : s;
    if (endIncl < s) throw new Error('end 는 start 보다 앞설 수 없어요');
    body.start = { date: s };
    body.end = { date: addDay(endIncl, 1) }; // 구글 종일 일정의 end 는 "다음 날"(배타적)
  } else {
    const s = parse(e.start, 'start');
    const eDate = e.end ? parse(e.end, 'end') : new Date(s.getTime() + 3_600_000);
    if (eDate < s) throw new Error('end 는 start 보다 앞설 수 없어요');
    body.start = { dateTime: withSeconds(e.start), timeZone };
    body.end = { dateTime: e.end ? withSeconds(e.end) : eDate.toISOString(), timeZone };
  }
  return body;
}

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

/** 시간 일정에는 시각이 꼭 있어야 한다 (날짜만 주면 구글이 거부한다). */
const requireTime = (v: unknown, field: string) => {
  if (typeof v !== 'string' || !/T\d{2}:\d{2}/.test(v)) {
    throw new Error(`${field} 에 시각이 필요해요. 예: 2026-11-27T15:00 (종일 일정이면 all_day 를 true 로)`);
  }
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
    requireTime(e.start, 'start');
    if (e.end) requireTime(e.end, 'end');
    const s = parse(e.start, 'start');
    const eDate = e.end ? parse(e.end, 'end') : new Date(s.getTime() + 3_600_000);
    if (eDate < s) throw new Error('end 는 start 보다 앞설 수 없어요');
    body.start = { dateTime: withSeconds(e.start), timeZone };
    body.end = { dateTime: e.end ? withSeconds(e.end) : eDate.toISOString(), timeZone };
  }
  return body;
}

// ───────────────────────── 수정 / 삭제 ─────────────────────────

export type GEventLite = {
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export type EventChanges = {
  title?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  /** 빈 문자열이면 지운다 */
  location?: string;
  notes?: string;
};

const ID_RE = /^[A-Za-z0-9_-]{1,1024}$/;

/** 구글 이벤트 id. 경로에 들어가므로 허용 문자만 통과시킨다. */
export function checkEventId(id: unknown): string {
  if (typeof id !== 'string' || !ID_RE.test(id)) {
    throw new Error('event_id 가 올바르지 않아요. gcal_list_events 결과의 id 를 그대로 사용하세요');
  }
  return id;
}

/** 도구 입력(snake_case)을 검증해 변경 사항으로 만든다. 하나도 없으면 오류. */
export function normalizeChanges(i: Record<string, unknown>): EventChanges {
  const c: EventChanges = {};
  const optStr = (k: string, max: number, allowEmpty: boolean) => {
    const v = i[k];
    if (v === undefined || v === null) return undefined;
    if (typeof v !== 'string') throw new Error(`${k} 는 문자열이어야 해요`);
    const t = v.trim();
    if (!t && !allowEmpty) throw new Error(`${k} 는 비울 수 없어요`);
    return t.slice(0, max);
  };
  const title = optStr('title', 200, false);
  if (title !== undefined) c.title = title;
  const start = optStr('start', 40, false);
  if (start !== undefined) c.start = start;
  const end = optStr('end', 40, false);
  if (end !== undefined) c.end = end;
  const location = optStr('location', 200, true);
  if (location !== undefined) c.location = location;
  const notes = optStr('notes', 2000, true);
  if (notes !== undefined) c.notes = notes;
  if (i.all_day !== undefined && i.all_day !== null) {
    if (typeof i.all_day !== 'boolean') throw new Error('all_day 는 true/false 여야 해요');
    c.allDay = i.all_day;
  }
  if (Object.keys(c).length === 0) throw new Error('바꿀 내용이 없어요 (title, start, end, all_day, location, notes 중 하나 이상)');
  return c;
}

const diffDays = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * 기존 일정(existing)에 변경(c)을 적용하는 events.patch 본문을 만든다.
 * - start 만 바꾸면 기존 길이를 유지해 통째로 옮긴다 ("3시로 옮겨줘")
 * - 종일 ↔ 시간 전환 시 반대쪽 필드를 null 로 비운다
 * - 반복 일정의 한 회차(instance)를 대상으로 하면 그 회차만 바뀐다
 */
export function buildEventPatch(existing: GEventLite, c: EventChanges, timeZone: string): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (c.title !== undefined) body.summary = c.title;
  if (c.location !== undefined) body.location = c.location === '' ? null : c.location;
  if (c.notes !== undefined) body.description = c.notes === '' ? null : c.notes;

  if (c.start !== undefined || c.end !== undefined || c.allDay !== undefined) {
    const wasAllDay = !!existing.start?.date;
    const allDay = c.allDay ?? wasAllDay;
    if (allDay) {
      const exStart = existing.start?.date ?? (existing.start?.dateTime ? localYmd(new Date(existing.start.dateTime)) : undefined);
      if (!exStart && c.start === undefined) throw new Error('start 가 필요해요');
      const exEndIncl = existing.end?.date ? addDay(existing.end.date, -1) : exStart!;
      const s = c.start !== undefined ? toYmd(c.start, 'start') : exStart!;
      const e = c.end !== undefined ? toYmd(c.end, 'end') : addDay(s, c.start !== undefined && exStart ? Math.max(diffDays(exStart, exEndIncl), 0) : 0);
      if (e < s) throw new Error('end 는 start 보다 앞설 수 없어요');
      body.start = { date: s, dateTime: null };
      body.end = { date: addDay(e, 1), dateTime: null };
    } else {
      if (c.start !== undefined) requireTime(c.start, 'start');
      if (c.end !== undefined) requireTime(c.end, 'end');
      const exS = existing.start?.dateTime
        ? new Date(existing.start.dateTime)
        : existing.start?.date
          ? new Date(`${existing.start.date}T09:00:00`) // 종일 → 시간 전환: 그날 오전 9시를 기본으로
          : undefined;
      if (!exS && c.start === undefined) throw new Error('start 가 필요해요');
      const exE = existing.end?.dateTime && !wasAllDay ? new Date(existing.end.dateTime) : exS ? new Date(exS.getTime() + 3_600_000) : undefined;
      const dur = exS && exE ? Math.max(exE.getTime() - exS.getTime(), 0) || 3_600_000 : 3_600_000;
      const s = c.start !== undefined ? parse(c.start, 'start') : exS!;
      const e = c.end !== undefined ? parse(c.end, 'end') : c.start !== undefined ? new Date(s.getTime() + dur) : exE ?? new Date(s.getTime() + dur);
      if (e < s) throw new Error('end 는 start 보다 앞설 수 없어요');
      body.start = { dateTime: c.start !== undefined ? withSeconds(c.start) : s.toISOString(), timeZone, date: null };
      body.end = { dateTime: c.end !== undefined ? withSeconds(c.end) : e.toISOString(), timeZone, date: null };
    }
  }
  return body;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const WD = '일월화수목금토';

/** 확인 창에 보여줄 사람이 읽는 일정 설명. 예: "11/27(금) 15:00–16:00 · 김과장님 약속 · 강남" */
export function describeEvent(e: GEventLite): string {
  const day = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`;
  let when = '(시간 정보 없음)';
  if (e.start?.date) {
    const s = new Date(`${e.start.date}T00:00:00`);
    const eIncl = e.end?.date ? new Date(`${addDay(e.end.date, -1)}T00:00:00`) : s;
    when = eIncl.getTime() > s.getTime() ? `${day(s)}~${day(eIncl)} 종일` : `${day(s)} 종일`;
  } else if (e.start?.dateTime) {
    const s = new Date(e.start.dateTime);
    const t = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const en = e.end?.dateTime ? new Date(e.end.dateTime) : undefined;
    when = `${day(s)} ${t(s)}` + (en ? (day(en) === day(s) ? `–${t(en)}` : ` ~ ${day(en)} ${t(en)}`) : '');
  }
  return [when, e.summary || '(제목 없음)', e.location].filter(Boolean).join(' · ');
}

// ---- 캘린더 앱 연동: calendarapp://assistant?cmd=… (읽기 query / 날짜 화면 show)
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const cmdId = (now: number, rnd: () => number) => `${now.toString(36)}${rnd().toString(36).slice(2, 8)}`;

function ymdOf(v: unknown, field: string): string {
  if (typeof v !== 'string' || !YMD.test(v)) throw new Error(`${field} 는 YYYY-MM-DD 형식이어야 해요`);
  return v;
}

/** 캘린더 앱에 일정 조회를 요청하는 링크. from/to 를 주지 않으면 앱이 오늘부터 14일을 돌려준다 */
export function buildCalendarEventsQuery(
  i: Record<string, unknown>,
  now: number = Date.now(),
  rnd: () => number = Math.random,
): { id: string; url: string } {
  const id = cmdId(now, rnd);
  const cmd: Record<string, unknown> = { v: 1, id, ts: now, op: 'query', what: 'events' };
  if (i.from != null) cmd.from = ymdOf(i.from, 'from');
  if (i.to != null) cmd.to = ymdOf(i.to, 'to');
  return { id, url: `calendarapp://assistant?cmd=${encodeURIComponent(JSON.stringify(cmd))}` };
}

/** 캘린더 앱에서 그 날짜를 여는 링크 */
export function buildCalendarShowLink(date: string, now: number = Date.now(), rnd: () => number = Math.random): string {
  const cmd = { v: 1, id: cmdId(now, rnd), ts: now, op: 'show', date: ymdOf(date, 'date') };
  return `calendarapp://assistant?cmd=${encodeURIComponent(JSON.stringify(cmd))}`;
}

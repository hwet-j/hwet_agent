import { buildEventBody, buildEventPatch, checkEventId, normalizeChanges, type GEventLite, type NewEvent } from '../calendar/pure';
import { freshAccessToken } from './auth';

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const MAX_RANGE_MS = 366 * 86_400_000;

export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

async function call(path: string, init?: RequestInit) {
  const token = await freshAccessToken();
  if (!token) throw new Error('구글 계정이 연결되어 있지 않거나 로그인이 만료됐어요. 설정 탭에서 다시 연결해 주세요.');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Calendar 오류 (HTTP ${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const parse = (v: unknown, field: string): Date => {
  const d = typeof v === 'string' ? new Date(v) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw new Error(`${field} 가 올바른 날짜/시각이 아니에요: ${String(v)}`);
  return d;
};

type GEvent = {
  id?: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

/** 비서에게 돌려줄 때는 필요한 필드만 남긴다 (참석자 이메일 등은 제외). */
const slim = (e: GEvent) => ({
  id: e.id,
  title: e.summary ?? '(제목 없음)',
  start: e.start?.dateTime ?? e.start?.date,
  end: e.end?.dateTime ?? e.end?.date,
  allDay: !!e.start?.date,
  location: e.location,
});

export async function listEvents(timeMin: unknown, timeMax: unknown, maxResults?: unknown) {
  const from = parse(timeMin, 'time_min');
  const to = parse(timeMax, 'time_max');
  if (to <= from) throw new Error('time_max 는 time_min 보다 뒤여야 해요');
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) throw new Error('조회 기간은 최대 1년이에요');
  const n = typeof maxResults === 'number' ? Math.min(Math.max(Math.trunc(maxResults), 1), 50) : 25;
  const qs = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(n),
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
  });
  const data = await call(`?${qs}`);
  return { events: ((data.items ?? []) as GEvent[]).map(slim), truncated: !!data.nextPageToken };
}

export async function addEvent(e: NewEvent) {
  const body = buildEventBody(e, deviceTimeZone());
  const created = (await call('', { method: 'POST', body: JSON.stringify(body) })) as GEvent;
  return { created: slim(created), link: created.htmlLink };
}

const eventPath = (id: string) => `/${encodeURIComponent(checkEventId(id))}`;

/** 일정 하나를 조회한다 (확인 창 미리보기·수정 계산용). */
export async function getEvent(id: unknown): Promise<GEvent> {
  return (await call(eventPath(id as string))) as GEvent;
}

/** 확인 창에 보여줄 현재 일정 설명용 */
export async function getEventLite(id: unknown): Promise<GEventLite> {
  return getEvent(id) as Promise<GEventLite>;
}

/** 일정 수정. 반복 일정의 한 회차 id 를 주면 그 회차만 바뀐다. 참석자에게 알림 메일은 보내지 않는다. */
export async function updateEvent(id: unknown, input: Record<string, unknown>) {
  const changes = normalizeChanges(input); // 먼저 검증 (네트워크 호출 전에 실패)
  const existing = await getEvent(id);
  if ((existing as { status?: string }).status === 'cancelled') throw new Error('이미 삭제된 일정이에요');
  const body = buildEventPatch(existing as GEventLite, changes, deviceTimeZone());
  const updated = (await call(`${eventPath(id as string)}?sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(body) })) as GEvent;
  return { updated: slim(updated), link: updated.htmlLink };
}

/** 일정 삭제. 반복 일정의 한 회차 id 를 주면 그 회차만 삭제된다. */
export async function deleteEvent(id: unknown) {
  const existing = await getEvent(id); // 존재 확인 + 결과에 삭제한 일정 정보를 돌려주기 위해
  await call(`${eventPath(id as string)}?sendUpdates=none`, { method: 'DELETE' });
  return { deleted: slim(existing) };
}

import { buildEventBody, type NewEvent } from '../calendar/pure';
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

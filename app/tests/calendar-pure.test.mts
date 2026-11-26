import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCalendarDeepLink, buildEventBody } from '../src/integrations/calendar/pure.ts';

test('딥링크: 인코딩, 빈 값 제외, 종일 플래그', () => {
  const url = buildCalendarDeepLink({ title: '치과 & 검진', start: '2026-11-27T15:00', location: '  ', allDay: true });
  assert.equal(url, 'calendarapp://event/new?title=%EC%B9%98%EA%B3%BC%20%26%20%EA%B2%80%EC%A7%84&start=2026-11-27T15%3A00&allDay=1');
  assert.equal(buildCalendarDeepLink({}), 'calendarapp://event/new');
});

test('시간 일정: 초 보정, 종료 없으면 1시간 뒤, 시간대 포함', () => {
  const b = buildEventBody({ title: ' 회의 ', start: '2026-11-27T15:00', end: '2026-11-27T16:30' }, 'Asia/Seoul') as any;
  assert.equal(b.summary, '회의');
  assert.deepEqual(b.start, { dateTime: '2026-11-27T15:00:00', timeZone: 'Asia/Seoul' });
  assert.deepEqual(b.end, { dateTime: '2026-11-27T16:30:00', timeZone: 'Asia/Seoul' });
  const c = buildEventBody({ title: 'x', start: '2026-11-27T15:00:00+09:00' }, 'Asia/Seoul') as any;
  assert.equal(c.end.dateTime, '2026-11-27T07:00:00.000Z'); // 15:00+09:00 의 1시간 뒤(UTC)
});

test('종일 일정: 끝 날짜는 다음 날(배타적), 날짜 밀림 없음', () => {
  const one = buildEventBody({ title: '제사', start: '2026-12-01', allDay: true }, 'Asia/Seoul') as any;
  assert.deepEqual(one.start, { date: '2026-12-01' });
  assert.deepEqual(one.end, { date: '2026-12-02' });
  const multi = buildEventBody({ title: '휴가', start: '2026-12-30', end: '2027-01-02', allDay: true }, 'Asia/Seoul') as any;
  assert.deepEqual(multi.end, { date: '2027-01-03' });
  // 시간이 포함된 값도 "현지 날짜"로 환산 (UTC 로 바꾸면 하루 밀릴 수 있음)
  const local = buildEventBody({ title: 'x', start: '2026-12-01T00:30', allDay: true }, 'Asia/Seoul') as any;
  assert.deepEqual(local.start, { date: '2026-12-01' });
});

test('검증: 제목 없음, 잘못된 날짜, 종료가 시작보다 앞섬', () => {
  assert.throws(() => buildEventBody({ title: '  ', start: '2026-11-27T15:00' }, 'UTC'), /title/);
  assert.throws(() => buildEventBody({ title: 'x', start: 'abc' }, 'UTC'), /start/);
  assert.throws(() => buildEventBody({ title: 'x', start: '2026-11-27T15:00', end: '2026-11-27T14:00' }, 'UTC'), /end/);
  assert.throws(() => buildEventBody({ title: 'x', start: '2026-12-02', end: '2026-12-01', allDay: true }, 'UTC'), /end/);
});

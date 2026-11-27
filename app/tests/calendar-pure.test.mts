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

// ───────────────────────── 수정 / 삭제 ─────────────────────────
import { buildEventPatch, checkEventId, describeEvent, normalizeChanges } from '../src/integrations/calendar/pure.ts';

const local = (m: number, d: number, h: number, mi = 0) => new Date(2026, m - 1, d, h, mi).toISOString();
const timed = (s: string, e: string) => ({ summary: '회의', start: { dateTime: s }, end: { dateTime: e } });

test('이벤트 id 검증: 경로 조작·공백·빈 값 거부, 반복 회차 id 허용', () => {
  assert.equal(checkEventId('abc123def'), 'abc123def');
  assert.equal(checkEventId('abc123_20261127T060000Z'), 'abc123_20261127T060000Z');
  for (const bad of ['', '../x', 'a/b', 'a b', 'a?b', 5, undefined, 'x'.repeat(1025)]) {
    assert.throws(() => checkEventId(bad as never), /event_id/, String(bad));
  }
});

test('변경 입력 검증: 필드 변환, 빈 장소/메모 허용(지우기), 빈 제목·타입 오류·변경 없음 거부', () => {
  assert.deepEqual(normalizeChanges({ title: ' 새 제목 ', location: '', all_day: false, ignored: 1 }), { title: '새 제목', location: '', allDay: false });
  assert.throws(() => normalizeChanges({}), /바꿀 내용이 없어요/);
  assert.throws(() => normalizeChanges({ title: '  ' }), /title/);
  assert.throws(() => normalizeChanges({ all_day: 'yes' }), /all_day/);
  assert.throws(() => normalizeChanges({ start: 5 }), /start/);
});

test('수정: 제목·장소·메모만 바꾸면 시간은 건드리지 않고, 빈 값은 null 로 지운다', () => {
  const b = buildEventPatch(timed(local(11, 27, 15), local(11, 27, 16)), { title: '새 제목', location: '', notes: '메모' }, 'Asia/Seoul');
  assert.deepEqual(b, { summary: '새 제목', location: null, description: '메모' });
});

test('수정: 시작만 바꾸면 기존 길이(90분)를 유지해 통째로 옮긴다', () => {
  const b = buildEventPatch(timed(local(11, 27, 15), local(11, 27, 16, 30)), { start: '2026-11-28T10:00' }, 'Asia/Seoul') as any;
  assert.deepEqual(b.start, { dateTime: '2026-11-28T10:00:00', timeZone: 'Asia/Seoul', date: null });
  assert.equal(b.end.dateTime, new Date(new Date('2026-11-28T10:00').getTime() + 90 * 60_000).toISOString());
  assert.equal(b.end.date, null);
});

test('수정: 종료만 바꾸면 시작은 그대로', () => {
  const b = buildEventPatch(timed(local(11, 27, 15), local(11, 27, 16)), { end: '2026-11-27T18:00' }, 'Asia/Seoul') as any;
  assert.equal(b.start.dateTime, local(11, 27, 15));
  assert.equal(b.end.dateTime, '2026-11-27T18:00:00');
});

test('수정: 종일 일정을 옮기면 기간(일수)을 유지하고 끝 날짜는 배타적', () => {
  const ex = { summary: '휴가', start: { date: '2026-12-01' }, end: { date: '2026-12-03' } }; // 12/1~12/2 (2일)
  const b = buildEventPatch(ex, { start: '2026-12-10' }, 'Asia/Seoul') as any;
  assert.deepEqual(b.start, { date: '2026-12-10', dateTime: null });
  assert.deepEqual(b.end, { date: '2026-12-12', dateTime: null });
});

test('수정: 시간 → 종일 전환은 시작일의 현지 날짜 기준, 종일 → 시간 전환은 그날 9시부터 1시간', () => {
  const toAll = buildEventPatch(timed(local(11, 27, 15), local(11, 27, 16)), { allDay: true }, 'Asia/Seoul') as any;
  assert.deepEqual(toAll.start, { date: '2026-11-27', dateTime: null });
  assert.deepEqual(toAll.end, { date: '2026-11-28', dateTime: null });
  const toTimed = buildEventPatch({ start: { date: '2026-12-01' }, end: { date: '2026-12-02' } }, { allDay: false }, 'Asia/Seoul') as any;
  assert.equal(toTimed.start.dateTime, new Date('2026-12-01T09:00:00').toISOString());
  assert.equal(toTimed.end.dateTime, new Date(new Date('2026-12-01T09:00:00').getTime() + 3_600_000).toISOString());
  assert.equal(toTimed.start.date, null);
});

test('수정 검증: 종료가 시작보다 앞섬, 시간 일정에 시각 없음', () => {
  const ex = timed(local(11, 27, 15), local(11, 27, 16));
  assert.throws(() => buildEventPatch(ex, { end: '2026-11-27T10:00' }, 'UTC'), /end/);
  assert.throws(() => buildEventPatch(ex, { start: '2026-11-28' }, 'UTC'), /시각이 필요/);
  assert.throws(() => buildEventPatch({ start: { date: '2026-12-02' }, end: { date: '2026-12-03' } }, { start: '2026-12-01', end: '2026-11-30', allDay: true }, 'UTC'), /end/);
});

test('추가: 시간 일정에 날짜만 주면 거부 (구글이 400 으로 거부하므로 미리 안내)', () => {
  assert.throws(() => buildEventBody({ title: 'x', start: '2026-11-27' }, 'UTC'), /시각이 필요/);
  assert.doesNotThrow(() => buildEventBody({ title: 'x', start: '2026-11-27', allDay: true }, 'UTC'));
});

test('일정 설명: 시간/종일/여러 날/제목 없음/장소', () => {
  assert.equal(describeEvent({ summary: '김과장님 약속', location: '강남', start: { dateTime: local(11, 27, 15) }, end: { dateTime: local(11, 27, 16) } }), '11/27(금) 15:00–16:00 · 김과장님 약속 · 강남');
  assert.equal(describeEvent({ summary: '제사', start: { date: '2026-12-01' }, end: { date: '2026-12-02' } }), '12/1(화) 종일 · 제사');
  assert.equal(describeEvent({ summary: '휴가', start: { date: '2026-12-01' }, end: { date: '2026-12-04' } }), '12/1(화)~12/3(목) 종일 · 휴가');
  assert.equal(describeEvent({ start: { dateTime: local(11, 27, 15) } }), '11/27(금) 15:00 · (제목 없음)');
  assert.equal(describeEvent({ start: { dateTime: local(11, 27, 22) }, end: { dateTime: local(11, 28, 1) } }, ), '11/27(금) 22:00 ~ 11/28(토) 01:00 · (제목 없음)');
});

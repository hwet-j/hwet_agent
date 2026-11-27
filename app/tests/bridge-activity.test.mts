import assert from 'node:assert/strict';
import { test } from 'node:test';

import { kindOf, statusOf, summarize } from '../src/agent/activityPure.ts';
import { dayLabel, filterRows, groupByDay, statusInfo } from '../src/core/activityView.ts';
import { createBridge, isResultUrl, parseResultUrl } from '../src/integrations/bridgePure.ts';
import { buildCalendarEventsQuery, buildCalendarShowLink } from '../src/integrations/calendar/pure.ts';
import { buildLeaselogQueryLink, buildQueryRequest, screenForQuery } from '../src/integrations/leaselog/pure.ts';

const result = (id: string, app: string, payload: unknown) =>
  `hwetassistant://result?id=${id}&app=${app}&data=${encodeURIComponent(JSON.stringify(payload))}`;

test('결과 주소 파싱: 정상', () => {
  const r = parseResultUrl(result('a-1', 'leaselog', { ok: true, what: 'income', data: { year: 2026 } }));
  assert.equal(r?.id, 'a-1');
  assert.equal(r?.app, 'leaselog');
  assert.deepEqual(r?.payload.data, { year: 2026 });
});

test('결과 주소 파싱: 잘못된 입력은 null', () => {
  assert.equal(parseResultUrl('https://evil.example/result?id=a&app=leaselog&data={}'), null);
  assert.equal(parseResultUrl(result('a b', 'leaselog', { ok: true })), null);
  assert.equal(parseResultUrl(result('a', 'other', { ok: true })), null);
  assert.equal(parseResultUrl('hwetassistant://result?id=a&app=leaselog&data=%7Boops'), null);
  assert.equal(parseResultUrl(result('a', 'leaselog', { nope: 1 })), null);
  assert.equal(parseResultUrl('hwetassistant://result?id=a&app=leaselog&data=%E0%A4%A'), null);
  assert.equal(parseResultUrl('hwetassistant://result?id=a&app=leaselog&data=' + 'x'.repeat(210_000)), null);
});

test('isResultUrl: 결과 주소만', () => {
  assert.ok(isResultUrl('hwetassistant://result?id=a'));
  assert.ok(isResultUrl('hwetassistant:///result?id=a'));
  assert.ok(isResultUrl('/result?id=a'));
  assert.ok(!isResultUrl('hwetassistant://other'));
  assert.ok(!isResultUrl('/'));
});

test('브리지: 기다리던 id 와 앱이 맞을 때만 풀리고, 한 번만', async () => {
  const b = createBridge();
  const p = b.wait('id1', 'leaselog', 1000);
  assert.equal(b.handle(result('zzz', 'leaselog', { ok: true })), false, '모르는 id');
  assert.equal(b.handle(result('id1', 'calendar', { ok: true })), false, '앱 불일치(다른 앱이 가로채려는 경우)');
  assert.equal(b.size(), 1);
  assert.equal(b.handle(result('id1', 'leaselog', { ok: true, data: 5 })), true);
  assert.deepEqual(await p, { ok: true, data: 5 });
  assert.equal(b.handle(result('id1', 'leaselog', { ok: true })), false, '재사용 불가');
  assert.equal(b.size(), 0);
});

test('브리지: 시간 초과 시 reject, 취소하면 정리', async () => {
  const b = createBridge();
  await assert.rejects(b.wait('t', 'calendar', 20), /timeout/);
  assert.equal(b.size(), 0);
  const p = b.wait('c', 'calendar', 5000);
  p.catch(() => {});
  b.cancel('c');
  assert.equal(b.size(), 0);
});

test('LeaseLog 조회 요청 검증과 링크', () => {
  assert.deepEqual(buildQueryRequest({ what: 'income', year: 2026 }), { what: 'income', year: 2026 });
  assert.deepEqual(buildQueryRequest({ what: 'payments', month: '2026-10' }), { what: 'payments', ym: '2026-10' });
  assert.throws(() => buildQueryRequest({ what: 'delete_all' }));
  assert.throws(() => buildQueryRequest({ what: 'income', year: 1999 }));
  assert.throws(() => buildQueryRequest({ what: 'payments', month: '2026-13' }));
  const { id, url } = buildLeaselogQueryLink({ what: 'overview' }, 1_700_000_000_000, () => 0.5);
  assert.ok(url.startsWith('rentmanager://assistant?cmd='));
  const cmd = JSON.parse(decodeURIComponent(url.split('cmd=')[1]));
  assert.deepEqual({ v: cmd.v, op: cmd.op, what: cmd.what, id: cmd.id, ts: cmd.ts }, { v: 1, op: 'query', what: 'overview', id, ts: 1_700_000_000_000 });
});

test('조회 → 열기 화면 매핑', () => {
  assert.deepEqual(screenForQuery({ what: 'income', month: '2026-10' }), { screen: 'income', month: '2026-10' });
  assert.deepEqual(screenForQuery({ what: 'unpaid' }), { screen: 'payments', filter: 'unpaid' });
  assert.deepEqual(screenForQuery({ what: 'overview' }), { screen: 'home' });
  assert.equal(screenForQuery({ what: 'zzz' }), null);
});

test('캘린더 앱 조회/열기 링크', () => {
  const q = buildCalendarEventsQuery({ from: '2026-12-01', to: '2026-12-07' }, 1_700_000_000_000, () => 0.25);
  assert.ok(q.url.startsWith('calendarapp://assistant?cmd='));
  const cmd = JSON.parse(decodeURIComponent(q.url.split('cmd=')[1]));
  assert.deepEqual({ op: cmd.op, what: cmd.what, from: cmd.from, to: cmd.to, id: cmd.id }, { op: 'query', what: 'events', from: '2026-12-01', to: '2026-12-07', id: q.id });
  assert.throws(() => buildCalendarEventsQuery({ from: '12/01' }));
  const show = JSON.parse(decodeURIComponent(buildCalendarShowLink('2026-12-25').split('cmd=')[1]));
  assert.deepEqual({ op: show.op, date: show.date }, { op: 'show', date: '2026-12-25' });
  assert.throws(() => buildCalendarShowLink('내일'));
});

test('활동 기록: 종류·상태·요약', () => {
  assert.equal(kindOf({ readOnly: true }), 'read');
  assert.equal(kindOf({}), 'write');
  assert.equal(statusOf({ handoff: true }, 'ok'), 'handoff');
  assert.equal(statusOf({}, 'ok'), 'ok');
  assert.equal(statusOf({ handoff: true }, 'error'), 'error');
  assert.equal(statusOf({}, 'denied'), 'denied');
  assert.equal(summarize({ label: '할 일 추가', describe: (i) => `할 일 추가: ${i.title}` }, { title: '치과' }), '할 일 추가: 치과');
  assert.equal(summarize({ label: '메모 저장' }, { title: '장보기', body: 'x'.repeat(100) }), '메모 저장 (title=장보기)');
  assert.equal(summarize({ label: 'X', describe: () => { throw new Error('boom'); } }, {}), 'X');
});

test('활동 기록 화면: 필터·날짜 묶기·라벨', () => {
  const rows = [
    { ts: new Date(2026, 10, 27, 15).toISOString(), kind: 'write', status: 'ok' },
    { ts: new Date(2026, 10, 27, 9).toISOString(), kind: 'read', status: 'error' },
    { ts: new Date(2026, 10, 26, 22).toISOString(), kind: 'write', status: 'denied' },
  ] as const;
  const r = [...rows];
  assert.equal(filterRows(r, 'all').length, 3);
  assert.equal(filterRows(r, 'write').length, 2);
  assert.equal(filterRows(r, 'read').length, 1);
  assert.equal(filterRows(r, 'problem').length, 2);
  const g = groupByDay(r);
  assert.deepEqual(g.map((x) => [x.day, x.data.length]), [['2026-11-27', 2], ['2026-11-26', 1]]);
  const now = new Date(2026, 10, 27, 12);
  assert.match(dayLabel('2026-11-27', now), /^오늘/);
  assert.match(dayLabel('2026-11-26', now), /^어제/);
  assert.equal(dayLabel('2026-11-20', now), '11월 20일 (금)');
  assert.equal(statusInfo({ status: 'handoff', kind: 'write' }).label, '앱에서 확인 필요');
});

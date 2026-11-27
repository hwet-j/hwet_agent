import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSnapshot, pickCalendar, pickLeaselog, type Snapshot } from '../src/integrations/snapshotPure.ts';

const NOW = new Date(2026, 10, 27, 12).getTime();
const ls = (data: object, ts = NOW - 3600_000): Snapshot => ({ v: 1, app: 'leaselog', ts, data });
const cal = (extra: object = {}): Snapshot => ({
  v: 1, app: 'calendar', ts: NOW - 60_000, from: '2026-10-27', to: '2027-12-31',
  events: [
    { id: 'a', title: '병원', allDay: false, start: '2026-11-27T10:00', end: '2026-11-27T11:00', profile: '나' },
    { id: 'b', title: '출장', allDay: true, start: '2026-11-29', end: '2026-12-01', profile: '나' },
    { id: 'c', title: '먼 일정', allDay: false, start: '2027-03-01T09:00', end: '2027-03-01T10:00', profile: '나' },
  ],
  ...extra,
});

test('parseSnapshot: 정상/앱 불일치/버전/깨진 JSON', () => {
  assert.equal(parseSnapshot(JSON.stringify(ls({})), 'leaselog')?.app, 'leaselog');
  assert.equal(parseSnapshot(JSON.stringify(ls({})), 'calendar'), null);
  assert.equal(parseSnapshot(JSON.stringify({ v: 2, app: 'leaselog', ts: 1 }), 'leaselog'), null);
  assert.equal(parseSnapshot('{oops', 'leaselog'), null);
  assert.equal(parseSnapshot(undefined, 'leaselog'), null);
  assert.equal(parseSnapshot('x'.repeat(2_000_001), 'leaselog'), null);
});

test('LeaseLog: 종류별 선택과 asOf', () => {
  const s = ls({ overview: { rooms: 3 }, unpaid: { items: [] }, income: { '2026': { year: 2026 }, '2025': { year: 2025 } }, payments: { '2026-10': { items: [1] }, '2026-08': { items: [2] } }, rooms: { items: [] }, tenants: { items: [] } });
  const o = pickLeaselog(s, { what: 'overview' }, NOW);
  assert.ok(o.ok && (o.data as any).rooms === 3 && o.asOf === '2026-11-27T11:00' && !o.stale);
  assert.deepEqual((pickLeaselog(s, { what: 'income' }, NOW) as any).data, { year: 2026 });
  assert.deepEqual((pickLeaselog(s, { what: 'income', year: 2025 }, NOW) as any).data, { year: 2025 });
  assert.equal(pickLeaselog(s, { what: 'income', year: 2020 }, NOW).ok, false);
  assert.deepEqual((pickLeaselog(s, { what: 'payments', month: '2026-10' }, NOW) as any).data, { items: [1] });
});

test('LeaseLog: 입금 없는 달은 빈 목록, 범위 밖은 missing', () => {
  const s = ls({ payments: { '2026-10': { items: [1] }, '2026-08': { items: [2] } } });
  const empty = pickLeaselog(s, { what: 'payments', month: '2026-09' }, NOW);
  assert.ok(empty.ok && (empty.data as any).items.length === 0);
  assert.equal(pickLeaselog(s, { what: 'payments', month: '2019-01' }, NOW).ok, false);
  assert.equal(pickLeaselog(s, { what: 'bogus' }, NOW).ok, false);
  assert.equal(pickLeaselog(ls({}), { what: 'overview' }, NOW).ok, false);
});

test('오래된 스냅샷은 stale', () => {
  const p = pickLeaselog(ls({ overview: {} }, NOW - 30 * 3600_000), { what: 'overview' }, NOW);
  assert.ok(p.ok && p.stale);
});

test('캘린더: 기간 겹침(종일 마지막 날 포함), 기본 14일', () => {
  const r = pickCalendar(cal(), { from: '2026-11-28', to: '2026-12-01' }, NOW);
  assert.ok(r.ok);
  assert.deepEqual((r.data as any).events.map((e: any) => e.id), ['b']);
  const d = pickCalendar(cal(), {}, NOW);
  assert.ok(d.ok);
  assert.deepEqual((d.data as any).events.map((e: any) => e.id), ['a', 'b']);
  assert.equal((d.data as any).from, '2026-11-27');
  assert.equal((d.data as any).to, '2026-12-11');
});

test('캘린더: 스냅샷 기간 밖이면 missing, 단일 날짜 조회', () => {
  assert.equal(pickCalendar(cal(), { from: '2026-01-01', to: '2026-01-10' }, NOW).ok, false);
  assert.equal(pickCalendar(cal(), { from: '2026-11-27', to: '2028-06-01' }, NOW).ok, false);
  const one = pickCalendar(cal(), { from: '2026-11-27', to: '2026-11-27' }, NOW);
  assert.deepEqual((one as any).data.events.map((e: any) => e.id), ['a']);
});

test('캘린더: 많으면 150건으로 자름', () => {
  const events = Array.from({ length: 200 }, (_, i) => ({ id: `e${i}`, title: 't', allDay: false, start: '2026-11-28T09:00', end: '2026-11-28T10:00', profile: '나' }));
  const r = pickCalendar(cal({ events }), { from: '2026-11-28', to: '2026-11-28' }, NOW) as any;
  assert.equal(r.data.count, 200);
  assert.equal(r.data.events.length, 150);
  assert.equal(r.data.truncated, true);
});

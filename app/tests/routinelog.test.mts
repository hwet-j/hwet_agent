import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, buildAddPath, buildLogArgs, dayItems, dayComplete, isDue, streaks, summarizeRoutines, weeklyProgress, type Log, type Routine, type RoutineQuery } from '../src/integrations/routinelog/pure.ts';

const vit: Routine = { id: 'r1', name: '비타민D', kind: 'supplement', schedule: 'daily', start_date: '2026-10-01', times: [{ time: '08:00', label: '아침' }, { time: '21:00', label: '저녁' }] };
const med: Routine = { id: 'r2', name: '혈압약', kind: 'medication', schedule: 'weekdays', weekdays: 31, start_date: '2026-10-01', end_date: '2026-12-31', times: [{ time: '09:00' }] };
const run: Routine = { id: 'r3', name: '운동', kind: 'habit', schedule: 'weekly_count', weekly_count: 3, start_date: '2026-10-01', daily_target: 1, unit: 'km' };
const water: Routine = { id: 'r4', name: '물', kind: 'habit', schedule: 'daily', start_date: '2026-10-01', daily_target: 3, unit: '잔' };
const every3: Routine = { id: 'r5', name: '주사', kind: 'medication', schedule: 'interval', interval_days: 3, start_date: '2026-11-01', times: [{ time: '22:00' }] };

const L = (p: Partial<Log> & { routine: string; date: string }): Log => ({ id: Math.random().toString(36), status: 'done', ...p });

test('해당일 판정: 매일/요일 마스크(월=1)/N일마다/기간', () => {
  assert.ok(isDue(vit, '2026-11-27'));
  assert.ok(!isDue(vit, '2026-09-30'), '시작 전');
  assert.ok(isDue(med, '2026-11-27'), '금요일'); // 2026-11-27 은 금요일
  assert.ok(!isDue(med, '2026-11-28'), '토요일');
  assert.ok(!isDue(med, '2027-01-04'), '종료 후');
  assert.ok(isDue(every3, '2026-11-04') && !isDue(every3, '2026-11-05') && isDue(every3, '2026-11-07'));
  assert.ok(!isDue({ ...vit, archived: 1 }, '2026-11-27'));
});

test('오늘 항목: 슬롯별 상태, 지난 시각 미체크는 overdue', () => {
  const q = { routines: [vit, med, water], logs: [L({ routine: '비타민D', date: '2026-11-27', slot: '08:00', logged_at: '2026-11-27T08:10:00' }), L({ routine: '물', date: '2026-11-27', count: 2 })] };
  const items = dayItems(q, '2026-11-27', { today: '2026-11-27', hm: '12:00' });
  const by = (n: string, s?: string) => items.find((x) => x.routine === n && x.slot === s)!;
  assert.equal(by('비타민D', '08:00').status, 'done');
  assert.equal(by('비타민D', '21:00').status, 'pending');
  assert.equal(by('혈압약', '09:00').status, 'overdue');
  const w = items.find((x) => x.routine === '물')!;
  assert.deepEqual([w.status, w.done, w.target], ['pending', 2, 3]);
  assert.deepEqual(items.map((x) => x.slot ?? '-'), ['08:00', '09:00', '21:00', '-']);
});

test('건너뜀은 skipped, 지난 날 미체크는 overdue', () => {
  const q = { routines: [vit], logs: [L({ routine: '비타민D', date: '2026-11-26', slot: '08:00', status: 'skipped' })] };
  const items = dayItems(q, '2026-11-26', { today: '2026-11-27', hm: '01:00' });
  assert.deepEqual(items.map((x) => x.status), ['skipped', 'overdue']);
});

test('연속 일수: 쉬는 날 건너뛰기, 오늘 진행 중이면 끊지 않기, 놓치면 끊기', () => {
  const days = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']; // 월~목 완료, 금(오늘) 아직
  const logs = days.map((d) => L({ routine: '혈압약', date: d, slot: '09:00' }));
  const s = streaks({ logs }, med, '2026-11-27', 30);
  assert.equal(s.current, 4, '토·일은 해당일이 아니라 건너뜀, 오늘은 진행 중');
  // 그 전 주 금요일(11-20)을 놓쳤다면 거기서 끊김
  const s2 = streaks({ logs: [...logs, L({ routine: '혈압약', date: '2026-11-19', slot: '09:00' })] }, med, '2026-11-27', 30);
  assert.equal(s2.current, 4);
  assert.ok(s2.longest >= 4);
  // 어제(목) 놓침 → 현재 0
  const s3 = streaks({ logs: logs.slice(0, 3) }, med, '2026-11-27', 30);
  assert.equal(s3.current, 0);
  assert.equal(s3.rate !== null && s3.rate < 100, true);
});

test('습관 일 목표: 횟수 누적, 주 N회 진행', () => {
  assert.equal(dayComplete({ logs: [L({ routine: '물', date: '2026-11-27', count: 3 })] }, water, '2026-11-27'), true);
  assert.equal(dayComplete({ logs: [L({ routine: '물', date: '2026-11-27', count: 2 })] }, water, '2026-11-27'), false);
  assert.equal(dayComplete({ logs: [] }, run, '2026-11-27'), null);
  // 2026-11-27 금요일 → 이번 주 월요일은 11-23
  const logs = [L({ routine: '운동', date: '2026-11-23' }), L({ routine: '운동', date: '2026-11-23', value: 3 }), L({ routine: '운동', date: '2026-11-25' }), L({ routine: '운동', date: '2026-11-20' })];
  assert.deepEqual(weeklyProgress({ logs }, run, '2026-11-27'), { done: 2, target: 3 });
  assert.equal(weeklyProgress({ logs }, water, '2026-11-27'), null);
});

test('요약: 달성률·값 합계·최근 메모', () => {
  const q: RoutineQuery = { today: '2026-11-27', routines: [water, run], logs: [
    L({ routine: '물', date: '2026-11-26', count: 3 }), L({ routine: '물', date: '2026-11-25', count: 1 }),
    L({ routine: '운동', date: '2026-11-26', value: 5, note: '한강 5km' }), L({ routine: '운동', date: '2026-11-24', value: 3.5, note: '트레드밀' }),
  ] };
  const s = summarizeRoutines(q, 3);
  const w = s.find((x) => x.routine === '물')!;
  assert.equal(w.due, 2);
  assert.equal(w.done, 1);
  assert.equal(w.rate, 50);
  const r = s.find((x) => x.routine === '운동')!;
  assert.equal(r.valueTotal, 5);
  assert.equal(r.unit, 'km');
  assert.equal(r.recentNotes[0].note, '한강 5km');
  assert.deepEqual(r.week, { done: 2, target: 3 });
});

test('날짜 계산 보조', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('체크 요청 검증', () => {
  assert.deepEqual(buildLogArgs({ routine: ' 비타민D ', slot: '아침' }, 'q1'), { req_id: 'q1', routine: '비타민D', slot: '아침' });
  assert.deepEqual(buildLogArgs({ routine: '운동', value: 5, note: '러닝', count: 2, status: 'done', date: '2026-11-27' }, 'q2'), { req_id: 'q2', routine: '운동', date: '2026-11-27', status: 'done', count: 2, value: 5, note: '러닝' });
  assert.throws(() => buildLogArgs({}, 'q'));
  assert.throws(() => buildLogArgs({ routine: 'a', date: '내일' }, 'q'));
  assert.throws(() => buildLogArgs({ routine: 'a', status: 'maybe' }, 'q'));
  assert.throws(() => buildLogArgs({ routine: 'a', count: 0 }, 'q'));
  assert.throws(() => buildLogArgs({ routine: 'a', value: NaN }, 'q'));
});

test('새 루틴 딥링크 경로 검증', () => {
  const p = buildAddPath({ name: '오메가 3', kind: 'supplement', times: ['8:00', '21:00'], days: '1111100', detail: '1정, 식후' });
  assert.ok(p.startsWith('add?name=%EC%98%A4%EB%A9%94%EA%B0%80'));
  assert.match(p, /kind=supplement/);
  assert.match(p, /times=08%3A00%2C21%3A00/);
  assert.match(p, /days=1111100/);
  assert.throws(() => buildAddPath({}));
  assert.throws(() => buildAddPath({ name: 'a', kind: 'pill' }));
  assert.throws(() => buildAddPath({ name: 'a', times: ['25:00'] }));
  assert.throws(() => buildAddPath({ name: 'a', days: '11111' }));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildDigest, isDue } from '../src/automation/digestPure.ts';

test('일정·복약·미납을 한 줄씩 요약', () => {
  const d = buildDigest({
    today: '2026-11-28',
    events: [{ title: '치과', start: '2026-11-28T15:00' }, { title: '회의', start: '2026-11-28T10:00' }],
    routinesLeft: [{ routine: '비타민', slot: '09:00', status: 'overdue' }, { routine: '운동', status: 'pending' }],
    unpaid: [{ room: '101호', building: 'A동', remaining: 450000, overdue: true }, { room: '102호', remaining: 100000 }],
  });
  assert.equal(d.empty, false);
  const lines = d.body.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^일정 2건: 10:00 회의 · 15:00 치과$/);
  assert.match(lines[1], /^복약·루틴 2건 남음\(놓친 1\): 09:00 비타민 · 운동$/);
  assert.match(lines[2], /^월세 미납 2건\(연체 1\) · 550,000원: A동 101호, 102호$/);
});

test('읽지 못한 앱(null)은 건너뛰고, 모두 비면 안내 문구', () => {
  assert.equal(buildDigest({ today: 'x', events: null, routinesLeft: null, unpaid: null }).empty, true);
  const d = buildDigest({ today: 'x', events: null, routinesLeft: [], unpaid: [{ room: '1', remaining: 10 }] });
  assert.equal(d.body.split('\n').length, 1);
  assert.match(d.body, /^월세 미납 1건 · 10원: 1$/);
});

test('항목이 많으면 3개까지만 보이고 나머지는 건수', () => {
  const events = Array.from({ length: 5 }, (_, i) => ({ title: `e${i}`, start: `2026-11-28T0${i}:00` }));
  assert.match(buildDigest({ today: 'x', events, routinesLeft: null, unpaid: null }).body, /외 2건$/);
});

test('알림 시각 이후 하루 한 번만', () => {
  const s = { enabled: true, hour: 8, minute: 30 };
  assert.equal(isDue({ date: '2026-11-28', hour: 8, minute: 29 }, s), false);
  assert.equal(isDue({ date: '2026-11-28', hour: 8, minute: 30 }, s), true);
  assert.equal(isDue({ date: '2026-11-28', hour: 23, minute: 0 }, s), true);
  assert.equal(isDue({ date: '2026-11-28', hour: 9, minute: 0 }, { ...s, lastSent: '2026-11-28' }), false);
  assert.equal(isDue({ date: '2026-11-29', hour: 9, minute: 0 }, { ...s, lastSent: '2026-11-28' }), true);
  assert.equal(isDue({ date: '2026-11-28', hour: 9, minute: 0 }, { ...s, enabled: false }), false);
});

import { daysUntil, expiryDue, leaseCalendarEvents, occupiedRooms, payDayToday } from '../src/automation/leasePure.ts';

const rooms = occupiedRooms({
  items: [
    { building: 'A', room: '101', status: 'occupied', end: '2026-12-28', payDay: 5, tenant: '홍길동' },
    { building: '', room: '102', status: 'occupied', end: '2027-06-01', payDay: 31 },
    { building: 'A', room: '103', status: 'vacant' },
    { building: 'A', room: '104', status: 'occupied', end: 'bad' },
  ],
});

test('호실: 입주 중이고 만기가 유효한 것만, 세입자 정보 제외', () => {
  assert.equal(rooms.length, 2);
  assert.equal('tenant' in rooms[0], false);
  assert.equal(daysUntil('2026-11-28', '2026-12-28'), 30);
});

test('만기 단계: 새 단계에 들어설 때 한 번만, 놓쳐도 다음에 한 번', () => {
  // 30일 전: 30단계
  let r = expiryDue(rooms, '2026-11-28', {});
  assert.deepEqual(r.items, [{ where: 'A 101', daysLeft: 30 }]);
  // 같은 날 다시 실행: 알리지 않음
  assert.deepEqual(expiryDue(rooms, '2026-11-28', r.stages).items, []);
  // 다음 날(29일 전): 아직 30단계 → 알리지 않음
  assert.deepEqual(expiryDue(rooms, '2026-11-29', r.stages).items, []);
  // 사흘 놓치고 12일 전에 실행: 14단계로 한 번
  const late = expiryDue(rooms, '2026-12-16', r.stages);
  assert.deepEqual(late.items, [{ where: 'A 101', daysLeft: 12 }]);
  assert.deepEqual(expiryDue(rooms, '2026-12-17', late.stages).items, []);
  // 만기 당일은 0단계
  assert.equal(expiryDue(rooms, '2026-12-28', late.stages).items[0].daysLeft, 0);
  // 60일보다 먼 건 알리지 않음
  assert.deepEqual(expiryDue(rooms, '2026-11-28', {}).items.some((i) => i.where === '102'), false);
});

test('납부일: 31일은 짧은 달의 말일에', () => {
  assert.deepEqual(payDayToday(rooms, '2026-12-05'), ['A 101']);
  assert.deepEqual(payDayToday(rooms, '2026-11-30'), ['102']); // 11월은 30일까지
  assert.deepEqual(payDayToday(rooms, '2026-12-31'), ['102']);
  assert.deepEqual(payDayToday(rooms, '2026-12-06'), []);
});

test('요약에 납부일·만기 줄이 들어간다', () => {
  const d = buildDigest({ today: 'x', events: null, routinesLeft: null, unpaid: null, payToday: ['A 101'], expiring: [{ where: 'A 101', daysLeft: 30 }, { where: '102', daysLeft: 0 }] });
  const lines = d.body.split('\n');
  assert.equal(lines[0], '오늘 월세 납부일: A 101');
  assert.equal(lines[1], '계약 만기 임박: A 101 D-30 · 102 오늘 만기');
});

test('캘린더 일정: 기간 안 만기만, 세입자 이름 없음', () => {
  const ev = leaseCalendarEvents(rooms, '2026-11-28');
  assert.equal(ev.length, 2);
  assert.equal(ev[0].title, '[월세] A 101 계약 만기');
  assert.equal(ev[0].start, '2026-12-28');
  assert.equal(leaseCalendarEvents(rooms, '2026-11-28', 60).length, 1);
  assert.equal(leaseCalendarEvents(rooms, '2028-01-01').length, 0);
});

import { missedDue, missedKey, missedMessage } from '../src/automation/missedPure.ts';

test('놓친 복약: 유예(30분)가 지난 것만, 한 번씩만', () => {
  const items = [
    { routine: '비타민', slot: '09:00', status: 'overdue' },
    { routine: '혈압약', slot: '09:20', status: 'overdue' },
    { routine: '운동', status: 'overdue' }, // 시각 없는 습관은 제외
    { routine: '유산균', slot: '08:00', status: 'done' },
  ];
  assert.deepEqual(missedDue(items, '2026-11-28', '09:35', new Set()).map((i) => i.routine), ['비타민']);
  const seen = new Set([missedKey('2026-11-28', items[0])]);
  assert.deepEqual(missedDue(items, '2026-11-28', '09:35', seen), []);
  assert.deepEqual(missedDue(items, '2026-11-28', '09:55', seen).map((i) => i.routine), ['혈압약']);
});

test('놓친 복약 메시지', () => {
  const m = missedMessage([{ routine: '비타민', slot: '09:00', status: 'overdue' }]);
  assert.equal(m.title, '아직 체크 안 한 약이 있어요');
  assert.match(m.body, /^09:00 비타민\n/);
});

import { latestAssistantRelease, shouldNotify } from '../src/automation/updatePure.ts';

test('새 버전: assistant-apk 태그 중 최대 번호, 같은 번호는 한 번만', () => {
  const rel = [
    { tag_name: 'assistant-apk-27', html_url: 'u27' },
    { tag_name: 'apps-latest', html_url: 'x' },
    { tag_name: 'assistant-apk-30', html_url: 'u30' },
    { tag_name: 'assistant-apk-31', html_url: 'u31', draft: true },
    { tag_name: 'assistant-apk-9', html_url: 'u9' },
  ];
  const l = latestAssistantRelease(rel);
  assert.deepEqual(l, { n: 30, tag: 'assistant-apk-30', url: 'u30' });
  assert.equal(shouldNotify(29, l, 0), true);
  assert.equal(shouldNotify(30, l, 0), false); // 이미 최신
  assert.equal(shouldNotify(29, l, 30), false); // 이미 알림
  assert.equal(shouldNotify(0, l, 0), false); // 개발 빌드
  assert.equal(latestAssistantRelease('x'), null);
  assert.equal(shouldNotify(1, null, 0), false);
});

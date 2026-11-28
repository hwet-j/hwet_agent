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

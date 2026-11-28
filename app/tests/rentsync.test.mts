import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRentAdds, paymentRows } from '../src/integrations/rentsync/pure.ts';

const REQ = /^[A-Za-z0-9_.:\-]{1,64}$/;

test('payments 조회 결과(배열·{items})에서 유효한 입금만 뽑는다', () => {
  const rows = [
    { date: '2026-11-05', building: '행복빌', room: '101호', tenant: '김철수', amount: 450000 },
    { date: '2026-11-xx', room: '102호', amount: 1 },
    { date: '2026-11-06', room: '103호', amount: 0 },
    { date: '2026-11-07', room: '104호', amount: '1' },
  ];
  assert.equal(paymentRows(rows).length, 1);
  assert.equal(paymentRows({ items: rows, truncated: true }).length, 1);
  assert.deepEqual(paymentRows(null), []);
  assert.equal('tenant' in paymentRows(rows)[0], false); // 세입자 이름은 가져가지 않는다
});

test('req_id 는 안정적이고 허용 문자만 쓴다', () => {
  const p = [{ date: '2026-11-05', building: '행복빌', room: '101호', amount: 450000 }];
  const a = buildRentAdds(p)[0];
  const b = buildRentAdds(p)[0];
  assert.equal(a.req_id, b.req_id);
  assert.match(a.req_id, REQ);
  assert.equal(a.merchant, '행복빌 101호 월세');
});

test('같은 날 같은 호실·금액 2건은 서로 다른 req_id', () => {
  const p = { date: '2026-11-05', building: '', room: '101호', amount: 200000 };
  const [x, y] = buildRentAdds([p, p]);
  assert.notEqual(x.req_id, y.req_id);
  // 입금 목록 순서가 같으면 다음 실행에서도 같은 id
  assert.deepEqual(buildRentAdds([p, p]).map((r) => r.req_id), [x.req_id, y.req_id]);
});

test('금액·날짜·호실이 다르면 req_id 도 다르다', () => {
  const base = { date: '2026-11-05', building: 'A', room: '101', amount: 100 };
  const ids = [base, { ...base, amount: 101 }, { ...base, date: '2026-11-06' }, { ...base, room: '102' }].map((r) => buildRentAdds([r])[0].req_id);
  assert.equal(new Set(ids).size, 4);
});

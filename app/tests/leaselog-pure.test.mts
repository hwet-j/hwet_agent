import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildLeaselogLink, buildPaymentRequest, buildTenantRequest } from '../src/integrations/leaselog/pure.ts';

const decode = (url: string) => {
  assert.ok(url.startsWith('rentmanager://assistant?cmd='));
  return JSON.parse(decodeURIComponent(url.slice('rentmanager://assistant?cmd='.length)));
};

test('납부 요청: 필드 매핑, 선택값 생략, 공백 제거', () => {
  const r = buildPaymentRequest({ room: ' 101호 ', amount: 450000, paid_on: '2026-11-26', memo: '계좌이체', extra: 'x' });
  assert.deepEqual(r, { room: '101호', amount: 450000, paidOn: '2026-11-26', memo: '계좌이체' });
  assert.deepEqual(buildPaymentRequest({ room: '201', amount: 1, period: '2026-11', building: '행복빌라' }), {
    room: '201', building: '행복빌라', amount: 1, period: '2026-11',
  });
});

test('납부 요청 검증: 호실·금액 필수, 정수/범위, 날짜 형식과 존재 여부', () => {
  for (const [bad, re] of [
    [{ amount: 1000 }, /room/],
    [{ room: '101' }, /amount/],
    [{ room: '101', amount: 0 }, /0보다/],
    [{ room: '101', amount: -1 }, /정수/],
    [{ room: '101', amount: 450000.5 }, /정수/],
    [{ room: '101', amount: '450000' }, /정수/],
    [{ room: '101', amount: 1e11 }, /정수/],
    [{ room: '101', amount: 1000, paid_on: '2026-2-3' }, /YYYY-MM-DD/],
    [{ room: '101', amount: 1000, paid_on: '2026-02-30' }, /존재하지/],
    [{ room: '101', amount: 1000, period: '2026-13' }, /period/],
    [{ room: 101, amount: 1000 }, /문자열/],
  ] as const) assert.throws(() => buildPaymentRequest(bad as never), re, JSON.stringify(bad));
});

test('세입자 요청: 호실 없이 인적 사항만, 호실+계약 조건', () => {
  assert.deepEqual(buildTenantRequest({ name: '박지후', phone: '010-5555-6666', guardian_phone: '010-1111-2222' }), {
    name: '박지후', phone: '010-5555-6666', guardianPhone: '010-1111-2222',
  });
  assert.deepEqual(
    buildTenantRequest({ name: '박지후', room: '102', deposit: 3000000, rent: 400000, fee: 30000, start: '2026-12-01', end: '2027-11-30', pay_day: 5 }),
    { name: '박지후', room: '102', deposit: 3000000, rent: 400000, fee: 30000, start: '2026-12-01', end: '2027-11-30', payDay: 5 },
  );
});

test('세입자 요청 검증: 이름 필수, 호실 없는 계약 조건 거부, 납부일·기간 검사', () => {
  for (const [bad, re] of [
    [{}, /name/],
    [{ name: '  ' }, /name/],
    [{ name: 'a', rent: 400000 }, /room/],
    [{ name: 'a', room: '1', pay_day: 0 }, /pay_day/],
    [{ name: 'a', room: '1', pay_day: 32 }, /pay_day/],
    [{ name: 'a', room: '1', pay_day: 5.5 }, /pay_day/],
    [{ name: 'a', room: '1', start: '2026-12-01', end: '2026-11-01' }, /앞설 수 없어요/],
    [{ name: 'a', room: '1', rent: '40만' }, /정수/],
  ] as const) assert.throws(() => buildTenantRequest(bad as never), re, JSON.stringify(bad));
});

test('허용 목록에 없는 민감 필드(반환 계좌·차량번호·실거주자 등)는 입력에 있어도 요청에 포함되지 않는다', () => {
  const r = buildTenantRequest({ name: '박지후', refundAcct: '국민 123-456-7890', car: '12가3456', resident: '아들', job: '회사', account: 'y' });
  assert.deepEqual(r, { name: '박지후' });
  const url = buildLeaselogLink('register_tenant', { name: '박지후', refundAcct: '국민 123-456-7890', car: '12가3456' });
  assert.doesNotMatch(decodeURIComponent(url), /123-456|12가3456/);
});

test('링크: 딥링크 형식, v/id/ts/op, 한글·특수문자 인코딩 왕복', () => {
  const url = buildLeaselogLink('record_payment', { room: '101호', amount: 450000, memo: '가나다 & "라마" 100%' }, 1_700_000_000_000, () => 0.123456789);
  assert.doesNotMatch(url, /[ "{}&]/, 'URL 에 인코딩되지 않은 문자가 없어야 함 (& 는 인코딩 필수)');
  const c = decode(url);
  assert.equal(c.v, 1);
  assert.equal(c.ts, 1_700_000_000_000);
  assert.equal(c.op, 'record_payment');
  assert.match(c.id, /^[0-9a-z]{8,}$/);
  assert.equal(c.memo, '가나다 & "라마" 100%');
});

test('링크: 호출마다 id 가 다르다 (재전송 방지용)', () => {
  const a = decode(buildLeaselogLink('record_payment', { room: '1', amount: 1 }));
  const b = decode(buildLeaselogLink('record_payment', { room: '1', amount: 1 }));
  assert.notEqual(a.id, b.id);
});

test('링크: 요청 크기 제한(8000자, LeaseLog 쪽 한도) 안에 들어온다', () => {
  const url = buildLeaselogLink('register_tenant', { name: 'ㄱ'.repeat(100), phone: '1'.repeat(100), guardian: 'ㄴ'.repeat(100), room: 'ㄷ'.repeat(100), building: 'ㄹ'.repeat(100) });
  assert.ok(decodeURIComponent(url.split('cmd=')[1]).length < 8000);
});

import { buildShowRequest } from '../src/integrations/leaselog/pure.ts';

test('화면 열기 요청: 필드 매핑(month → ym), 선택값 생략', () => {
  assert.deepEqual(buildShowRequest({ screen: 'income', month: '2026-10' }), { screen: 'income', ym: '2026-10' });
  assert.deepEqual(buildShowRequest({ screen: 'income', year: 2025 }), { screen: 'income', year: 2025 });
  assert.deepEqual(buildShowRequest({ screen: 'payments', month: '2026-11', filter: 'unpaid' }), { screen: 'payments', ym: '2026-11', filter: 'unpaid' });
  assert.deepEqual(buildShowRequest({ screen: 'rooms', extra: 1 }), { screen: 'rooms' });
});

test('화면 열기 요청 검증: 알 수 없는 화면·월·연도·필터 거부', () => {
  for (const [bad, re] of [
    [{}, /screen/],
    [{ screen: 'delete_all' }, /screen/],
    [{ screen: 'income', month: '2026-13' }, /month/],
    [{ screen: 'income', month: 202610 }, /month/],
    [{ screen: 'income', year: 1999 }, /year/],
    [{ screen: 'income', year: '2025' }, /year/],
    [{ screen: 'payments', filter: 'x' }, /filter/],
  ] as const) assert.throws(() => buildShowRequest(bad as never), re, JSON.stringify(bad));
});

test('링크: show 요청은 v/id/ts/op 와 함께 인코딩된다', () => {
  const c = decode(buildLeaselogLink('show', { screen: 'income', month: '2026-10' }, 1_700_000_000_000, () => 0.5));
  assert.equal(c.op, 'show');
  assert.equal(c.screen, 'income');
  assert.equal(c.ym, '2026-10');
  assert.equal(c.v, 1);
});

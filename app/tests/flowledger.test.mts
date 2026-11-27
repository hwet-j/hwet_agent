import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildAddArgs, buildUpdateArgs, filterTxs, previewText, previousPeriod, resolveAccountPreview, summarize, won, type LedgerQuery, type Tx,
} from '../src/integrations/flowledger/pure.ts';

const accounts: LedgerQuery['accounts'] = [
  { id: 'a1', name: '국민은행', kind: 'bank', balance: 1_000_000, is_default: 1 },
  { id: 'a2', name: '신한카드', kind: 'card', balance: -250_000, is_default: 0 },
  { id: 'a3', name: '신한체크', kind: 'bank', balance: 10_000, is_default: 0 },
  { id: 'a4', name: '옛날통장', kind: 'bank', balance: 0, is_default: 0, archived: 1 },
];
const rules: LedgerQuery['rules'] = [
  { id: 'r1', keyword: '넷플릭스', match: 'merchant', account: '신한카드' },
  { id: 'r2', keyword: '구독', match: 'category', account: '신한체크' },
];

test('금액 표기', () => {
  assert.equal(won(1234000), '1,234,000원');
  assert.equal(won(-500), '-500원');
});

test('추가 요청 검증: 정상/금액/유형/날짜/시간', () => {
  const a = buildAddArgs({ type: 'expense', amount: 9000, category: '외식', merchant: ' 김밥천국 ' }, 'req1');
  assert.deepEqual(a, { req_id: 'req1', type: 'expense', amount: 9000, category: '외식', merchant: '김밥천국' });
  assert.throws(() => buildAddArgs({ type: 'expense', amount: 0 }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'expense', amount: 12.5 }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'expense', amount: '9000' }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'gift', amount: 1 }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'expense', amount: 1, date: '2026-02-30' }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'expense', amount: 1, date: '내일' }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'expense', amount: 1, time: '25:00' }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'expense', amount: 10_000_000_000 }, 'r'));
});

test('이체 규칙: to_account 필수, 분류 불가, 지출에 to_account 불가', () => {
  assert.throws(() => buildAddArgs({ type: 'transfer', amount: 100 }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'transfer', amount: 100, to_account: 'x', category: '식비' }, 'r'));
  assert.throws(() => buildAddArgs({ type: 'expense', amount: 100, to_account: 'x' }, 'r'));
  assert.equal(buildAddArgs({ type: 'transfer', amount: 100, account: 'a', to_account: 'b' }, 'r').to_account, 'b');
});

test('수정 요청: 바꿀 항목 필수, 비우기', () => {
  assert.deepEqual(buildUpdateArgs({ id: 'x1', amount: 5000 }), { id: 'x1', amount: 5000 });
  assert.deepEqual(buildUpdateArgs({ id: 'x1', memo: '' }), { id: 'x1', memo: null });
  assert.throws(() => buildUpdateArgs({ id: 'x1' }));
  assert.throws(() => buildUpdateArgs({ amount: 1 }));
  assert.throws(() => buildUpdateArgs({ id: 'x1', time: '99:99' }));
});

test('통장 결정: 명시 > 규칙 > 기본, 보관 통장 제외, 모호함', () => {
  assert.deepEqual(resolveAccountPreview({ accounts, rules }, { account: '국민' }), { name: '국민은행', source: 'explicit' });
  const amb = resolveAccountPreview({ accounts, rules }, { account: '신한' });
  assert.equal(amb.source, 'unknown');
  assert.match(amb.hint ?? '', /신한카드.*신한체크/);
  assert.equal(resolveAccountPreview({ accounts, rules }, { account: '옛날통장' }).source, 'unknown');
  assert.equal(resolveAccountPreview({ accounts, rules }, { merchant: 'Netflix 넷플릭스' }).name, '신한카드');
  assert.equal(resolveAccountPreview({ accounts, rules }, { category: '취미/여가>구독' }).name, '신한체크');
  assert.deepEqual(resolveAccountPreview({ accounts, rules }, { merchant: '김밥천국' }), { name: '국민은행', source: 'default' });
  // 명시한 통장이 규칙보다 우선
  assert.equal(resolveAccountPreview({ accounts, rules }, { account: '국민은행', merchant: '넷플릭스' }).source, 'explicit');
});

test('미리보기 문구', () => {
  const args = buildAddArgs({ type: 'expense', amount: 9000, category: '식비>외식', merchant: '김밥천국' }, 'r');
  const t = previewText(args, { name: '국민은행', source: 'default' }, '2026-11-27');
  assert.match(t, /지출 9,000원/);
  assert.match(t, /국민은행 \(기본 통장\)/);
  assert.match(t, /2026-11-27 \(오늘\)/);
});

const tx = (p: Partial<Tx>): Tx => ({ id: Math.random().toString(36), type: 'expense', amount: 1000, date: '2026-11-10', account: '국민은행', ...p });
const txs: Tx[] = [
  tx({ amount: 9000, category: '식비>외식', merchant: '김밥천국', date: '2026-11-02' }),
  tx({ amount: 12000, category: '식비>외식', merchant: '김밥천국', date: '2026-11-05' }),
  tx({ amount: 5000, category: '식비>카페/간식', merchant: '스타벅스', date: '2026-11-06', account: '신한카드' }),
  tx({ amount: 80000, category: '쇼핑>의류', merchant: '무신사', date: '2026-11-12', account: '신한카드' }),
  tx({ amount: 3_000_000, type: 'income', category: '급여', date: '2026-11-25' }),
  tx({ amount: 500000, type: 'transfer', to_account: '신한카드', date: '2026-11-20' }),
  tx({ amount: 20000, category: '식비>외식', date: '2026-10-05' }),
  tx({ amount: 30000, category: '쇼핑>의류', date: '2026-10-07' }),
];

test('통계: 합계·분류 롤업·비율·통장·가맹점·이체 분리', () => {
  const s = summarize(txs, '2026-11-01', '2026-11-30');
  assert.equal(s.expense, 106000);
  assert.equal(s.income, 3_000_000);
  assert.equal(s.net, 2_894_000);
  assert.equal(s.transferTotal, 500000);
  assert.equal(s.period.days, 30);
  assert.equal(s.dailyAverageExpense, Math.round(106000 / 30));
  assert.deepEqual(s.byCategory.map((c) => c.category), ['쇼핑', '식비']);
  const food = s.byCategory.find((c) => c.category === '식비')!;
  assert.equal(food.amount, 26000);
  assert.equal(food.count, 3);
  assert.equal(food.ratio, Math.round((26000 / 106000) * 1000) / 10);
  assert.deepEqual(food.top[0], { name: '외식', amount: 21000 });
  assert.equal(s.byAccount[0].account, '신한카드');
  assert.deepEqual(s.topMerchants[0], { merchant: '무신사', amount: 80000, count: 1 });
  assert.equal(s.largest[0].amount, 80000);
});

test('통계: 직전 기간 비교', () => {
  const prev = previousPeriod('2026-11-01', '2026-11-30');
  assert.deepEqual(prev, { from: '2026-10-02', to: '2026-10-31' });
  const s = summarize(txs, '2026-11-01', '2026-11-30', prev);
  assert.equal(s.previous?.expense, 50000);
  assert.equal(s.previous?.expenseChangePct, 112);
  assert.equal(s.previous?.categoryChanges[0].category, '쇼핑');
});

test('통계: 빈 기간·미분류', () => {
  const s = summarize([], '2026-11-01', '2026-11-07');
  assert.equal(s.expense, 0);
  assert.equal(s.byCategory.length, 0);
  const u = summarize([tx({ amount: 10 })], '2026-11-01', '2026-11-30');
  assert.equal(u.byCategory[0].category, '미분류');
});

test('거래 필터', () => {
  assert.equal(filterTxs(txs, { merchant: '스타' }).length, 1);
  assert.equal(filterTxs(txs, { category: '식비' }).length, 4);
  assert.equal(filterTxs(txs, { account: '신한카드' }).length, 3); // 출금 2 + 이체 입금 1
  assert.equal(filterTxs(txs, { type: 'income' }).length, 1);
  assert.equal(filterTxs(txs, { min: 50000, max: 100000 }).length, 1);
  assert.equal(filterTxs(txs, { text: ' 김밥 천국' }).length, 2);
});

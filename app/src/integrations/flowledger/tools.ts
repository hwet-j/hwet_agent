import type { AgentTool } from '@/agent/tool';
import { kvGet } from '@/core/db';
import { callProvider } from '../../../modules/assistant-bridge';
import {
  AUTHORITY, buildAddArgs, buildUpdateArgs, filterTxs, previewText, previousPeriod, resolveAccountPreview, summarize, won,
  type LedgerQuery, type Tx, type TxFilter,
} from './pure';

const AUTO_KEY = 'flowledger_auto';
/** 설정에서 "가계부 기록은 확인 없이 바로 저장"을 켰는지 */
export const getAutoRecord = async () => (await kvGet(AUTO_KEY)) === '1';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const newReqId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

/** 제공자 호출 → 파싱된 JSON. 실패는 사람이 읽을 오류로 */
export async function call<T = any>(method: string, arg: unknown): Promise<T> {
  const r = await callProvider(AUTHORITY, method, arg);
  if (r.error) {
    if (r.error === 'unavailable') throw new Error('FlowLedger 앱을 찾을 수 없어요. 설치했는지, 이 연동을 지원하는 최신 버전인지 확인해 주세요.');
    if (r.error === 'no_db') throw new Error('FlowLedger 앱을 한 번 실행해 주세요. (아직 데이터가 만들어지지 않았어요)');
    if (r.error === 'forbidden') throw new Error('FlowLedger 가 이 앱의 접근을 거부했어요.');
    throw new Error(r.message ? `${r.message}` : `FlowLedger 오류: ${r.error}`);
  }
  try {
    return JSON.parse(r.json ?? '') as T;
  } catch {
    throw new Error('FlowLedger 응답을 해석할 수 없어요.');
  }
}

const query = (from: string, to: string, limit = 3000, includeItems = false) => call<LedgerQuery>('query', { from, to, limit, ...(includeItems ? { include_items: true } : {}) });

function period(i: Record<string, unknown>, defFromDays = 30): { from: string; to: string } {
  const today = new Date();
  const to = typeof i.to === 'string' ? i.to : ymd(today);
  const from = typeof i.from === 'string' ? i.from : ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - defFromDays + 1));
  for (const [k, v] of [['from', from], ['to', to]]) if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${k} 는 YYYY-MM-DD 형식이어야 해요`);
  if (to < from) throw new Error('to 가 from 보다 앞서요');
  return { from, to };
}
const monthOf = (d: string) => d.slice(0, 7);

const dateProps = {
  from: { type: 'string', description: '시작일 YYYY-MM-DD(포함). 생략하면 최근 30일' },
  to: { type: 'string', description: '종료일 YYYY-MM-DD(포함). 생략하면 오늘' },
};
const txProps = {
  amount: { type: 'integer', description: '금액(원). 9천원→9000, 1.2만원→12000' },
  date: { type: 'string', description: '날짜 YYYY-MM-DD. 생략하면 오늘' },
  time: { type: 'string', description: 'HH:MM(선택)' },
  account: { type: 'string', description: '통장/카드 이름. 사용자가 말한 경우에만 넣는다 (생략하면 규칙→기본 통장)' },
  category: { type: 'string', description: '분류 이름(예: 식비, 외식, 의류, 쇼핑>의류). flowledger_accounts 의 목록에 있는 이름을 쓴다' },
  merchant: { type: 'string', description: '가맹점/상호(예: 스타벅스)' },
  memo: { type: 'string' },
  tags: { type: 'string', description: '쉼표로 구분한 태그(선택)' },
};
const itemsProp = {
  type: 'array',
  description:
    '영수증 품목 목록(선택). 영수증 1장 = 거래 1건이고 품목별로 나눠 적는다. 품목 amount 합계가 거래 amount 와 반드시 같아야 한다(할인·쿠폰은 음수 줄, 세금·봉투값도 줄로). 각 품목에 category 를 넣으면 한 영수증이 분류별로 쪼개져 통계에 반영된다.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', description: '품목명' },
      qty: { type: 'number', description: '수량(생략 시 1)' },
      unit_price: { type: 'integer', description: '단가(원, 선택)' },
      amount: { type: 'integer', description: '품목 금액(원, 수량 반영 후, 할인은 음수)' },
      category: { type: 'string', description: '품목 분류(선택, 생략하면 거래 분류)' },
    },
    required: ['name', 'amount'],
  },
};

export const flowledgerTools: AgentTool[] = [
  {
    name: 'flowledger_accounts',
    label: 'FlowLedger 통장·분류 조회',
    readOnly: true,
    description:
      '가계부 앱 FlowLedger 의 통장(잔액, 기본 통장), 분류 목록, 월 예산, 통장 자동 지정 규칙을 읽는다. 앱을 열지 않고 백그라운드로 읽는다. ' +
      '기록 전에 어떤 통장/분류가 있는지 모를 때, 또는 "내 자산이 얼마야", "통장별 잔액"을 물을 때 쓴다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: {} },
    describe: () => 'FlowLedger 통장·분류 조회',
    async run() {
      const today = ymd(new Date());
      const q = await query(today, today, 1);
      const live = q.accounts.filter((a) => !a.archived);
      return {
        source: 'FlowLedger', totalAssets: live.reduce((s, a) => s + a.balance, 0),
        accounts: live.map((a) => ({ name: a.name, kind: a.kind, balance: a.balance, isDefault: !!a.is_default })),
        categories: { expense: q.categories.filter((c) => c.type === 'expense').map((c) => (c.parent ? `${c.parent}>${c.name}` : c.name)), income: q.categories.filter((c) => c.type === 'income').map((c) => c.name) },
        budgets: q.budgets, rules: q.rules,
      };
    },
  },
  {
    name: 'flowledger_summary',
    label: 'FlowLedger 지출·수입 통계',
    readOnly: true,
    description:
      '기간별 수입/지출 합계, 분류별 지출 비율(대분류 기준, 상위 소분류 포함), 통장별, 많이 쓴 가맹점, 가장 큰 지출, 직전 같은 기간과의 비교를 읽어 계산한다. ' +
      '"이번 달 어디에 돈을 많이 썼어", "식비 얼마 썼어", "지난달보다 늘었어?" 같은 질문에 쓴다. 한 달이면 예산 대비 진행률도 준다. 기간은 최대 400일. ' +
      '"이번 달"은 현재 시각 기준 1일~오늘(또는 말일), "지난달"은 전달 1일~말일로 계산해 from/to 에 넣는다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { ...dateProps } },
    describe: (i) => `FlowLedger 통계: ${i.from ?? '최근 30일'}${i.to ? ` ~ ${i.to}` : ''}`,
    openLink: (i) => ({ app: 'flowledger', label: 'FlowLedger에서 통계 보기', path: `stats?month=${monthOf(typeof i.from === 'string' ? i.from : ymd(new Date()))}` }),
    async run(input) {
      const { from, to } = period(input);
      const prev = previousPeriod(from, to);
      const spanDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${prev.from}T00:00:00Z`)) / 86_400_000) + 1;
      const withPrev = spanDays <= 400;
      const q = await query(withPrev ? prev.from : from, to, 3000, true);
      const s = summarize(q.transactions, from, to, withPrev ? prev : undefined);
      // 한 달 범위면 예산 대비 진행률
      const oneMonth = monthOf(from) === monthOf(to);
      const budgetStatus = oneMonth
        ? q.budgets.map((b) => {
            const spent = b.category ? (s.byCategory.find((c) => c.category === b.category)?.amount ?? 0) : s.expense;
            return { category: b.category ?? '전체', budget: b.amount, spent, remaining: b.amount - spent, usedPct: Math.round((spent / b.amount) * 1000) / 10 };
          })
        : undefined;
      return { source: 'FlowLedger', ...s, ...(budgetStatus ? { budgetStatus } : {}), ...(q.truncated ? { note: '거래가 많아 일부만 읽었어요. 통계가 실제보다 적을 수 있어요.' } : {}) };
    },
  },
  {
    name: 'flowledger_transactions',
    label: 'FlowLedger 거래 내역 조회',
    readOnly: true,
    description:
      '기간 안의 거래 목록을 조건(분류·통장·가맹점·유형·금액 범위·검색어)으로 찾는다(최대 50건, 최신순, total 은 조건에 맞는 전체 합계). ' +
      '"스타벅스 얼마 썼지", "어제 쓴 거", 수정·삭제할 거래의 id 를 찾을 때 쓴다. 기간을 말하지 않으면 최근 30일.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: {
        ...dateProps,
        type: { type: 'string', enum: ['expense', 'income', 'transfer'] },
        category: { type: 'string' }, account: { type: 'string' }, merchant: { type: 'string' },
        text: { type: 'string', description: '가맹점·메모·태그·분류에서 찾을 검색어' },
        min_amount: { type: 'integer' }, max_amount: { type: 'integer' },
        limit: { type: 'integer', description: '최대 50' },
      },
    },
    describe: (i) => `FlowLedger 거래 조회: ${[i.merchant, i.category, i.account, i.text].filter(Boolean).join(', ') || `${i.from ?? '최근 30일'}`}`,
    openLink: (i) => ({ app: 'flowledger', label: 'FlowLedger에서 내역 보기', path: `list?month=${monthOf(typeof i.from === 'string' ? i.from : ymd(new Date()))}` }),
    async run(input) {
      const { from, to } = period(input);
      const q = await query(from, to);
      const f: TxFilter = {
        category: input.category as string | undefined, account: input.account as string | undefined, merchant: input.merchant as string | undefined,
        type: input.type as Tx['type'] | undefined, text: input.text as string | undefined,
        min: input.min_amount as number | undefined, max: input.max_amount as number | undefined,
      };
      const hit = filterTxs(q.transactions, f);
      const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 50);
      const total = (type: Tx['type']) => hit.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
      return {
        source: 'FlowLedger', period: { from, to }, count: hit.length, expenseTotal: total('expense'), incomeTotal: total('income'),
        transactions: hit.slice(0, limit), ...(hit.length > limit ? { note: `최신 ${limit}건만 보여요` } : {}),
        ...(q.truncated ? { warning: '거래가 많아 일부만 읽었어요' } : {}),
      };
    },
  },
  {
    name: 'flowledger_items',
    label: 'FlowLedger 구매 품목 조회',
    readOnly: true,
    description:
      '영수증 품목 단위의 구매 내역을 찾는다(최근순, 최대 100개). "우유 얼마였지", "계란 마지막에 얼마에 샀어", "이번 달 마트에서 뭐 샀어"처럼 품목·가격을 물을 때 쓴다. ' +
      'text 는 품목명 부분일치. 같은 품목의 가격 변화는 결과의 date·unit_price/amount 로 비교해 알려 준다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { ...dateProps, text: { type: 'string', description: '품목명 검색어' }, merchant: { type: 'string' }, limit: { type: 'integer' } } },
    describe: (i) => `FlowLedger 구매 품목 조회: ${[i.text, i.merchant].filter(Boolean).join(', ') || `${i.from ?? '최근'}`}`,
    openLink: () => ({ app: 'flowledger', label: 'FlowLedger에서 구매 내역 보기', path: 'purchases' }),
    async run(input) {
      const arg: Record<string, unknown> = { limit: Math.min(Math.max(Number(input.limit) || 50, 1), 100) };
      for (const k of ['from', 'to', 'text', 'merchant']) if (typeof input[k] === 'string' && input[k]) arg[k] = input[k];
      return { source: 'FlowLedger', ...(await call('items', arg)) };
    },
  },
  {
    name: 'flowledger_add',
    label: 'FlowLedger 거래 기록',
    description:
      '가계부 앱 FlowLedger 에 수입/지출/이체를 기록한다. 앱을 열지 않고 바로 저장된다. ' +
      '통장(account)은 사용자가 말했을 때만 넣는다: 말하지 않으면 앱이 자동 지정 규칙→기본 통장 순으로 고른다("카드로", "월급통장에서" 같은 말은 해당 통장 이름으로). ' +
      '분류(category)는 내용에서 가장 알맞은 소분류/대분류를 flowledger_accounts 의 이름 중에서 고른다(모르면 생략하면 기타). ' +
      '이체는 type=transfer 에 account(출금)와 to_account(입금)가 필요하다. 날짜를 말하지 않으면 오늘로 기록된다. 금액이 불분명하면 먼저 물어본다. ' +
      '영수증 사진이 첨부되면 가맹점·날짜·품목(items)·할인·합계를 읽어 한 건으로 기록한다: 품목 합계가 총액과 맞는지 먼저 계산하고, 안 맞으면 읽은 줄을 다시 확인하거나 사용자에게 알린다. ' +
      '저장 후 결과의 account.balance_after 로 통장 잔액을 알려주고, 방금 건을 취소하려면 flowledger_delete 에 결과의 id 를 쓴다.',
    needsConfirm: true,
    skipConfirm: getAutoRecord,
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string', enum: ['expense', 'income', 'transfer'], description: '지출/수입/이체' }, ...txProps, to_account: { type: 'string', description: '이체 입금 통장' }, items: itemsProp },
      required: ['type', 'amount'],
    },
    describe: (i) => `${i.type === 'expense' ? '지출' : i.type === 'income' ? '수입' : '이체'} 기록: ${Number(i.amount).toLocaleString('ko-KR')}원${i.category ? ` · ${i.category}` : ''}${i.merchant ? ` · ${i.merchant}` : ''}${i.account ? ` · ${i.account}` : ''}`,
    async preview(input) {
      const args = buildAddArgs(input, 'preview');
      let acc: ReturnType<typeof resolveAccountPreview>;
      try {
        const today = ymd(new Date());
        acc = resolveAccountPreview(await query(today, today, 1), args);
      } catch {
        acc = { name: args.account ?? '(기본/규칙 통장)', source: 'unknown' };
      }
      return previewText(args, acc, ymd(new Date()));
    },
    async run(input) {
      const r = await call('add', buildAddArgs(input, newReqId()));
      return { source: 'FlowLedger', ...r };
    },
  },
  {
    name: 'flowledger_update',
    label: 'FlowLedger 거래 수정',
    description: '기존 거래를 고친다(바꿀 항목만 보낸다). id 는 flowledger_transactions 결과의 id 를 그대로 쓴다(추측 금지). 후보가 여럿이면 사용자에게 어느 건인지 묻는다. 지움은 merchant/memo/tags/time 을 빈 문자열로.',
    needsConfirm: true,
    skipConfirm: getAutoRecord,
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, ...txProps, to_account: { type: 'string' }, items: { ...itemsProp, description: '품목 전체 교체(빈 배열이면 품목 삭제). 합계는 총액과 같아야 한다' } }, required: ['id'] },
    describe: (i) => `거래 수정 (${String(i.id).slice(0, 10)}…): ${Object.keys(i).filter((k) => k !== 'id').join(', ')}`,
    async preview(input) {
      const a = buildUpdateArgs(input);
      const { id, ...rest } = a;
      return `다음 거래를 수정해요 (id ${String(id).slice(0, 12)})\n` + Object.entries(rest).map(([k, v]) => `• ${k} → ${k === 'amount' ? won(v as number) : v === null ? '(지움)' : String(v)}`).join('\n');
    },
    async run(input) {
      return { source: 'FlowLedger', ...(await call('update', buildUpdateArgs(input))) };
    },
  },
  {
    name: 'flowledger_delete',
    label: 'FlowLedger 거래 삭제',
    description: '거래를 삭제한다(되돌릴 수 없음). id 는 flowledger_transactions 또는 방금 flowledger_add 결과의 id 를 쓴다. 사용자가 "방금 거 취소"라고 하면 직전 기록의 id 로 삭제한다. 항상 사용자 확인을 받는다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    describe: (i) => `거래 삭제 (${String(i.id).slice(0, 10)}…)`,
    async preview(input) {
      const id = String(input.id);
      try {
        const q = await query('2000-01-01', ymd(new Date(Date.now() + 366 * 86_400_000)).replace(/^(\d{4})/, (y) => String(Math.min(+y, 2100))), 3000).catch(() => null);
        const t = q?.transactions.find((x) => x.id === id);
        if (t) return `삭제할 거래:\n${t.date} · ${won(t.amount)} · ${t.category ?? ''} · ${t.merchant ?? ''} · ${t.account}\n\n삭제하면 통장 잔액도 되돌아가요.`;
      } catch { /* 아래 기본 문구 */ }
      return `거래 ${id.slice(0, 12)} 를 삭제해요. 통장 잔액도 되돌아가요.`;
    },
    async run(input) {
      return { source: 'FlowLedger', ...(await call('delete', { id: String(input.id) })) };
    },
  },
  {
    name: 'flowledger_add_rule',
    label: 'FlowLedger 통장 자동 지정 규칙 추가',
    description: '"넷플릭스는 앞으로 카드통장으로"처럼, 가맹점/메모/분류에 keyword 가 들어간 거래를 자동으로 특정 통장에 기록하는 규칙을 만든다. match: merchant|category|memo|any(기본 any).',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: { keyword: { type: 'string' }, account: { type: 'string' }, match: { type: 'string', enum: ['merchant', 'category', 'memo', 'any'] } }, required: ['keyword', 'account'] },
    describe: (i) => `통장 규칙 추가: "${i.keyword}" → ${i.account}`,
    async preview(i) { return `"${i.keyword}" 이(가) 들어간 ${i.match && i.match !== 'any' ? i.match : '가맹점·메모·분류'} 거래는 앞으로 "${i.account}" 통장에 기록돼요.`; },
    async run(i) {
      if (typeof i.keyword !== 'string' || !i.keyword.trim() || typeof i.account !== 'string' || !i.account.trim()) throw new Error('keyword 와 account 가 필요해요');
      return { source: 'FlowLedger', ...(await call('add_rule', { keyword: i.keyword.trim().slice(0, 60), account: i.account.trim().slice(0, 60), match: i.match })) };
    },
  },
  {
    name: 'flowledger_delete_rule',
    label: 'FlowLedger 통장 규칙 삭제',
    description: 'flowledger_accounts 결과의 규칙 id 로 통장 자동 지정 규칙을 삭제한다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    describe: () => '통장 규칙 삭제',
    async run(i) { return { source: 'FlowLedger', ...(await call('delete_rule', { id: String(i.id) })) }; },
  },
];

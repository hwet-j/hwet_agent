/**
 * FlowLedger(가계부 앱) 연동의 순수 로직: 요청 검증, 통장 결정 미리보기, 통계 계산.
 * 앱(ContentProvider)이 돌려주는 거래 목록으로 통계를 비서 쪽에서 계산한다.
 */
export const AUTHORITY = 'com.hwetj.flowledger.assistant';

export type TxType = 'expense' | 'income' | 'transfer';
export type Tx = {
  id: string; type: TxType; amount: number; date: string; time?: string | null;
  account: string; to_account?: string | null; category?: string | null;
  merchant?: string | null; memo?: string | null; tags?: string | null; source?: string;
};
export type Account = { id: string; name: string; kind: string; balance: number; is_default: number | boolean; archived?: number | boolean };
export type Rule = { id: string; keyword: string; match: 'merchant' | 'category' | 'memo' | 'any'; account: string };
export type Budget = { category: string | null; amount: number };
export type LedgerQuery = {
  accounts: Account[]; categories: { id: string; name: string; type: string; parent?: string | null }[];
  budgets: Budget[]; rules: Rule[]; transactions: Tx[]; truncated?: boolean;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_AMOUNT = 9_999_999_999;

export const won = (n: number) => `${n < 0 ? '-' : ''}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`;

function optStr(v: unknown, field: string, max: number): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string') throw new Error(`${field} 는 문자열이어야 해요`);
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
}
function amount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > MAX_AMOUNT) throw new Error('amount 는 1 이상의 정수(원 단위)여야 해요');
  return v;
}
function date(v: unknown, field: string): string | undefined {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string' || !DATE.test(v)) throw new Error(`${field} 는 YYYY-MM-DD 형식이어야 해요`);
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (y < 2000 || y > 2100 || dt.getMonth() !== m - 1 || dt.getDate() !== d) throw new Error(`${field} 날짜가 올바르지 않아요`);
  return v;
}
const compact = <T extends Record<string, unknown>>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

/** 거래 추가 요청 검증 → provider `add` 인자 */
export function buildAddArgs(i: Record<string, unknown>, reqId: string) {
  if (i.type !== 'expense' && i.type !== 'income' && i.type !== 'transfer') throw new Error('type 은 expense, income, transfer 중 하나여야 해요');
  const time = optStr(i.time, 'time', 5);
  if (time && !TIME.test(time)) throw new Error('time 은 HH:MM 형식이어야 해요');
  const out = compact({
    req_id: reqId, type: i.type, amount: amount(i.amount), date: date(i.date, 'date'), time,
    account: optStr(i.account, 'account', 60), to_account: optStr(i.to_account, 'to_account', 60),
    category: optStr(i.category, 'category', 60), merchant: optStr(i.merchant, 'merchant', 80),
    memo: optStr(i.memo, 'memo', 300), tags: optStr(i.tags, 'tags', 100),
  });
  if (i.type === 'transfer' && !out.to_account) throw new Error('이체는 to_account(입금 통장)가 필요해요');
  if (i.type === 'transfer' && out.category) throw new Error('이체에는 category 를 쓸 수 없어요');
  if (i.type !== 'transfer' && out.to_account) throw new Error('to_account 는 이체에만 쓸 수 있어요');
  return out;
}

/** 수정 요청 검증: id + 바꿀 필드만. 빈 문자열/null 은 비우기(merchant, memo, tags, time) */
export function buildUpdateArgs(i: Record<string, unknown>) {
  if (typeof i.id !== 'string' || !i.id.trim()) throw new Error('id 가 필요해요 (flowledger_transactions 결과의 id)');
  const out: Record<string, unknown> = { id: i.id.trim() };
  if (i.amount !== undefined) out.amount = amount(i.amount);
  if (i.date !== undefined) out.date = date(i.date, 'date');
  for (const [k, max] of [['account', 60], ['to_account', 60], ['category', 60]] as const) {
    if (i[k] !== undefined) out[k] = optStr(i[k], k, max);
  }
  for (const [k, max] of [['merchant', 80], ['memo', 300], ['tags', 100]] as const) {
    if (i[k] !== undefined) out[k] = i[k] === null || i[k] === '' ? null : optStr(i[k], k, max);
  }
  if (i.time !== undefined) {
    if (i.time === null || i.time === '') out.time = null;
    else {
      const t = optStr(i.time, 'time', 5);
      if (!t || !TIME.test(t)) throw new Error('time 은 HH:MM 형식이어야 해요');
      out.time = t;
    }
  }
  if (Object.keys(out).length < 2) throw new Error('바꿀 항목이 없어요');
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** provider 와 같은 규칙으로 통장을 고른 결과 (확인 창 미리보기용). 우선순위: 명시 > 규칙 > 기본 통장 */
export function resolveAccountPreview(q: Pick<LedgerQuery, 'accounts' | 'rules'>, args: { account?: string; category?: string; merchant?: string; memo?: string }):
  { name: string; source: 'explicit' | 'rule' | 'default' | 'unknown'; hint?: string } {
  const live = q.accounts.filter((a) => !a.archived);
  if (args.account) {
    const n = norm(args.account);
    const exact = live.filter((a) => norm(a.name) === n || a.id === args.account);
    const part = exact.length ? exact : live.filter((a) => norm(a.name).includes(n));
    if (part.length === 1) return { name: part[0].name, source: 'explicit' };
    return { name: args.account, source: 'unknown', hint: part.length ? `후보: ${part.map((a) => a.name).join(', ')}` : '일치하는 통장이 없어요' };
  }
  const hay = { merchant: norm(args.merchant ?? ''), memo: norm(args.memo ?? ''), category: norm(args.category ?? '') };
  const hits = q.rules.filter((r) => {
    const k = norm(r.keyword);
    if (!k) return false;
    const targets = r.match === 'any' ? [hay.merchant, hay.memo, hay.category] : [hay[r.match]];
    return targets.some((t) => t.includes(k));
  }).sort((a, b) => b.keyword.length - a.keyword.length);
  for (const r of hits) {
    const acc = live.find((a) => a.name === r.account || a.id === r.account);
    if (acc) return { name: acc.name, source: 'rule', hint: `규칙 "${r.keyword}"` };
  }
  const def = live.find((a) => a.is_default);
  return def ? { name: def.name, source: 'default' } : { name: '(기본 통장 없음)', source: 'unknown' };
}

export function previewText(args: ReturnType<typeof buildAddArgs>, acc: ReturnType<typeof resolveAccountPreview>, today: string): string {
  const kind = args.type === 'expense' ? '지출' : args.type === 'income' ? '수입' : '이체';
  const lines = [`${kind} ${won(args.amount)}`];
  if (args.type === 'transfer') lines.push(`${acc.name} → ${args.to_account}`);
  else {
    lines.push(`통장: ${acc.name}${acc.source === 'default' ? ' (기본 통장)' : acc.source === 'rule' ? ` (${acc.hint}으로 지정)` : ''}${acc.source === 'unknown' ? ` ⚠ ${acc.hint ?? ''}` : ''}`);
    if (args.category) lines.push(`분류: ${args.category}`);
  }
  if (args.merchant) lines.push(`가맹점: ${args.merchant}`);
  if (args.memo) lines.push(`메모: ${args.memo}`);
  lines.push(`날짜: ${args.date ?? `${today} (오늘)`}${args.time ? ` ${args.time}` : ''}`);
  return lines.join('\n');
}

// ---- 통계
const top = (c?: string | null) => (c ? c.split('>')[0] : '미분류');

export type Summary = ReturnType<typeof summarize>;

/** [from, to] (포함) 거래의 수입/지출/분류/통장/가맹점 통계. 이체는 수입·지출에 넣지 않고 별도 합계 */
export function summarize(txs: Tx[], from: string, to: string, prev?: { from: string; to: string }) {
  const inRange = (t: Tx, a: string, b: string) => t.date >= a && t.date <= b;
  const cur = txs.filter((t) => inRange(t, from, to));
  const sum = (list: Tx[], type: TxType) => list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const expense = sum(cur, 'expense'), income = sum(cur, 'income');
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

  const cat = new Map<string, { amount: number; count: number; sub: Map<string, number> }>();
  for (const t of cur) {
    if (t.type !== 'expense') continue;
    const g = top(t.category);
    const e = cat.get(g) ?? { amount: 0, count: 0, sub: new Map() };
    e.amount += t.amount; e.count++;
    const subName = t.category?.includes('>') ? t.category.split('>')[1] : g;
    e.sub.set(subName, (e.sub.get(subName) ?? 0) + t.amount);
    cat.set(g, e);
  }
  const byCategory = [...cat.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([name, e]) => ({
    category: name, amount: e.amount, count: e.count, ratio: expense ? Math.round((e.amount / expense) * 1000) / 10 : 0,
    top: [...e.sub.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, a]) => ({ name: n, amount: a })),
  }));

  const acc = new Map<string, { expense: number; income: number }>();
  for (const t of cur) {
    if (t.type === 'transfer') continue;
    const e = acc.get(t.account) ?? { expense: 0, income: 0 };
    e[t.type] += t.amount; acc.set(t.account, e);
  }
  const mer = new Map<string, { amount: number; count: number }>();
  for (const t of cur) {
    if (t.type !== 'expense' || !t.merchant) continue;
    const e = mer.get(t.merchant) ?? { amount: 0, count: 0 };
    e.amount += t.amount; e.count++; mer.set(t.merchant, e);
  }
  const largest = cur.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map((t) => ({ id: t.id, date: t.date, amount: t.amount, category: t.category ?? null, merchant: t.merchant ?? null }));

  const out = {
    period: { from, to, days }, income, expense, net: income - expense,
    transferTotal: sum(cur, 'transfer'), count: cur.length,
    dailyAverageExpense: Math.round(expense / days),
    byCategory,
    byAccount: [...acc.entries()].map(([account, v]) => ({ account, ...v })).sort((a, b) => b.expense - a.expense),
    topMerchants: [...mer.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5).map(([merchant, v]) => ({ merchant, ...v })),
    largest,
    previous: undefined as undefined | { from: string; to: string; income: number; expense: number; expenseChangePct: number | null; categoryChanges: { category: string; amount: number; prevAmount: number; diff: number }[] },
  };
  if (prev) {
    const p = txs.filter((t) => inRange(t, prev.from, prev.to));
    const pe = sum(p, 'expense'), pi = sum(p, 'income');
    const pc = new Map<string, number>();
    for (const t of p) if (t.type === 'expense') pc.set(top(t.category), (pc.get(top(t.category)) ?? 0) + t.amount);
    out.previous = {
      ...prev, income: pi, expense: pe, expenseChangePct: pe ? Math.round(((expense - pe) / pe) * 1000) / 10 : null,
      categoryChanges: byCategory.map((c) => ({ category: c.category, amount: c.amount, prevAmount: pc.get(c.category) ?? 0, diff: c.amount - (pc.get(c.category) ?? 0) }))
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 5),
    };
  }
  return out;
}

/** 직전 같은 길이 구간 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = Date.parse(`${from}T00:00:00Z`), t = Date.parse(`${to}T00:00:00Z`);
  const len = t - f + 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(f - len), to: iso(f - 86_400_000) };
}

export type TxFilter = { category?: string; account?: string; merchant?: string; type?: TxType; min?: number; max?: number; text?: string };
export function filterTxs(txs: Tx[], f: TxFilter): Tx[] {
  const n = (s?: string | null) => norm(s ?? '');
  return txs.filter((t) =>
    (!f.type || t.type === f.type) &&
    (!f.category || n(t.category).includes(n(f.category))) &&
    (!f.account || n(t.account) === n(f.account) || n(t.to_account).includes(n(f.account))) &&
    (!f.merchant || n(t.merchant).includes(n(f.merchant))) &&
    (f.min == null || t.amount >= f.min) && (f.max == null || t.amount <= f.max) &&
    (!f.text || [t.merchant, t.memo, t.tags, t.category].some((x) => n(x).includes(n(f.text)))));
}

/**
 * LeaseLog(월세 관리 앱, com.rentmanager.app) 연동 요청 생성. 네트워크·RN 의존성이 없는 순수 함수.
 *
 * 프로토콜(상세는 LeaseLog 의 CLAUDE.md "AI 비서 연동"):
 *   rentmanager://assistant?cmd=<URL인코딩된 JSON {v:1,id,ts,op,...}>
 * LeaseLog 가 값이 채워진 폼을 열고, 사용자가 저장을 눌러야 반영된다. 데이터는 돌려받지 않는다.
 * 보증금 반환 계좌·차량번호·보호자 상세 같은 민감 정보는 이 경로로 보내지 않는다 (필드 허용 목록에 없음).
 */

export type LeaselogOp = 'record_payment' | 'register_tenant' | 'show';

export const SHOW_SCREENS = ['income', 'payments', 'home', 'rooms', 'tenants', 'utilities'] as const;
const SHOW_FILTERS = ['all', 'unpaid', 'paid'] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

const str = (v: unknown, field: string, max: number, required = false): string | undefined => {
  if (v == null || v === '') {
    if (required) throw new Error(`${field} 가 필요해요`);
    return undefined;
  }
  if (typeof v !== 'string') throw new Error(`${field} 는 문자열이어야 해요`);
  const s = v.trim();
  if (!s) {
    if (required) throw new Error(`${field} 가 필요해요`);
    return undefined;
  }
  return s.slice(0, max);
};

const money = (v: unknown, field: string, required = false): number | undefined => {
  if (v == null) {
    if (required) throw new Error(`${field} 가 필요해요`);
    return undefined;
  }
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1e10) {
    throw new Error(`${field} 는 0 이상의 정수(원 단위)여야 해요. 예: 45만원 → 450000`);
  }
  if (required && v === 0) throw new Error(`${field} 는 0보다 커야 해요`);
  return v;
};

const date = (v: unknown, field: string): string | undefined => {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string' || !DATE.test(v)) throw new Error(`${field} 는 YYYY-MM-DD 형식이어야 해요`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new Error(`${field} 가 존재하지 않는 날짜예요: ${v}`);
  return v;
};

const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export function buildPaymentRequest(i: Record<string, unknown>) {
  return compact({
    room: str(i.room, 'room', 30, true),
    building: str(i.building, 'building', 40),
    amount: money(i.amount, 'amount', true),
    paidOn: date(i.paid_on, 'paid_on'),
    period: i.period == null ? undefined : (typeof i.period === 'string' && YM.test(i.period) ? i.period : (() => { throw new Error('period 는 YYYY-MM 형식이어야 해요'); })()),
    memo: str(i.memo, 'memo', 100),
  });
}

export function buildTenantRequest(i: Record<string, unknown>) {
  const out = compact({
    name: str(i.name, 'name', 40, true),
    phone: str(i.phone, 'phone', 20),
    guardian: str(i.guardian, 'guardian', 40),
    guardianPhone: str(i.guardian_phone, 'guardian_phone', 20),
    room: str(i.room, 'room', 30),
    building: str(i.building, 'building', 40),
    deposit: money(i.deposit, 'deposit'),
    rent: money(i.rent, 'rent'),
    fee: money(i.fee, 'fee'),
    start: date(i.start, 'start'),
    end: date(i.end, 'end'),
  });
  if (i.pay_day != null) {
    if (typeof i.pay_day !== 'number' || !Number.isInteger(i.pay_day) || i.pay_day < 1 || i.pay_day > 31) {
      throw new Error('pay_day 는 1~31 사이 정수여야 해요');
    }
    out.payDay = i.pay_day;
  }
  if (out.start && out.end && String(out.end) < String(out.start)) throw new Error('end 는 start 보다 앞설 수 없어요');
  // 호실 없이 계약 정보만 주면 어느 호실인지 알 수 없다
  if (!out.room && ['deposit', 'rent', 'fee', 'start', 'end', 'payDay'].some((k) => k in out)) {
    throw new Error('보증금·월세·계약일 등을 등록하려면 room(호실)이 필요해요');
  }
  return out;
}

/** 조회용 화면 열기 요청. 데이터를 바꾸지 않고, LeaseLog 도 값을 돌려주지 않는다. */
export function buildShowRequest(i: Record<string, unknown>) {
  const screen = i.screen;
  if (typeof screen !== 'string' || !(SHOW_SCREENS as readonly string[]).includes(screen)) {
    throw new Error(`screen 은 ${SHOW_SCREENS.join(', ')} 중 하나여야 해요`);
  }
  const out: Record<string, unknown> = { screen };
  if (i.month != null) {
    if (typeof i.month !== 'string' || !YM.test(i.month)) throw new Error('month 는 YYYY-MM 형식이어야 해요');
    out.ym = i.month;
  }
  if (i.year != null) {
    if (typeof i.year !== 'number' || !Number.isInteger(i.year) || i.year < 2000 || i.year > 2100) throw new Error('year 는 2000~2100 사이 정수여야 해요');
    out.year = i.year;
  }
  if (i.filter != null) {
    if (typeof i.filter !== 'string' || !(SHOW_FILTERS as readonly string[]).includes(i.filter)) throw new Error(`filter 는 ${SHOW_FILTERS.join(', ')} 중 하나여야 해요`);
    out.filter = i.filter;
  }
  return out;
}

const newId = (now: number, rnd: () => number) => `${now.toString(36)}${rnd().toString(36).slice(2, 8)}`;

/** 요청 JSON 을 인텐트용 딥링크로 만든다. now/rnd 는 테스트에서 주입. */
export function buildLeaselogLink(
  op: LeaselogOp,
  input: Record<string, unknown>,
  now: number = Date.now(),
  rnd: () => number = Math.random,
): string {
  const body = op === 'record_payment' ? buildPaymentRequest(input) : op === 'show' ? buildShowRequest(input) : buildTenantRequest(input);
  const cmd = { v: 1, id: newId(now, rnd), ts: now, op, ...body };
  return `rentmanager://assistant?cmd=${encodeURIComponent(JSON.stringify(cmd))}`;
}

// ---- 읽기(query): LeaseLog 가 요약을 비서 앱으로 돌려준다 (연락처·주민번호·계좌·메모는 LeaseLog 쪽에서 아예 보내지 않음)
export const QUERY_WHATS = ['overview', 'income', 'unpaid', 'payments', 'rooms', 'tenants'] as const;
export type QueryWhat = (typeof QUERY_WHATS)[number];

export function buildQueryRequest(i: Record<string, unknown>): { what: QueryWhat; year?: number; ym?: string } {
  if (typeof i.what !== 'string' || !(QUERY_WHATS as readonly string[]).includes(i.what)) {
    throw new Error(`what 은 ${QUERY_WHATS.join(', ')} 중 하나여야 해요`);
  }
  const out: { what: QueryWhat; year?: number; ym?: string } = { what: i.what as QueryWhat };
  if (i.year != null) {
    if (typeof i.year !== 'number' || !Number.isInteger(i.year) || i.year < 2000 || i.year > 2100) throw new Error('year 는 2000~2100 사이 정수여야 해요');
    out.year = i.year;
  }
  if (i.month != null) {
    if (typeof i.month !== 'string' || !YM.test(i.month)) throw new Error('month 는 YYYY-MM 형식이어야 해요');
    out.ym = i.month;
  }
  return out;
}

/** 조회 요청 링크와 요청 id (결과를 기다릴 때 id 로 맞춰 본다) */
export function buildLeaselogQueryLink(
  input: Record<string, unknown>,
  now: number = Date.now(),
  rnd: () => number = Math.random,
): { id: string; url: string } {
  const id = newId(now, rnd);
  const cmd = { v: 1, id, ts: now, op: 'query', ...buildQueryRequest(input) };
  return { id, url: `rentmanager://assistant?cmd=${encodeURIComponent(JSON.stringify(cmd))}` };
}

/** 조회 종류 → 같은 내용을 LeaseLog 에서 직접 볼 수 있는 화면 */
export function screenForQuery(i: Record<string, unknown>): Record<string, unknown> | null {
  const what = i.what;
  const month = typeof i.month === 'string' && YM.test(i.month) ? i.month : undefined;
  const year = typeof i.year === 'number' ? i.year : undefined;
  if (what === 'income') return { screen: 'income', ...(month ? { month } : year ? { year } : {}) };
  if (what === 'unpaid') return { screen: 'payments', filter: 'unpaid', ...(month ? { month } : {}) };
  if (what === 'payments') return { screen: 'payments', ...(month ? { month } : {}) };
  if (what === 'rooms') return { screen: 'rooms' };
  if (what === 'tenants') return { screen: 'tenants' };
  if (what === 'overview') return { screen: 'home' };
  return null;
}

/** LeaseLog 입금 내역 → FlowLedger 수입 기록. 건마다 고정된 req_id 를 만들어 여러 번 실행해도 중복되지 않게 한다 */
export interface RentPayment {
  date: string;
  building: string;
  room: string;
  amount: number;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** payments 조회 결과(배열 또는 {items, truncated})에서 유효한 입금만 뽑는다. 연락처·세입자 이름은 쓰지 않는다 */
export function paymentRows(data: unknown): RentPayment[] {
  const list = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown })?.items) ? (data as { items: unknown[] }).items : [];
  const out: RentPayment[] = [];
  for (const r of list) {
    const o = r as Record<string, unknown>;
    const amount = o?.amount;
    if (typeof o?.date !== 'string' || !DATE.test(o.date)) continue;
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) continue;
    out.push({ date: o.date, building: typeof o.building === 'string' ? o.building : '', room: typeof o.room === 'string' ? o.room : '', amount });
  }
  return out;
}

/** FNV-1a 32bit → base36. 한글 이름이 들어가도 req_id 허용 문자([A-Za-z0-9_.:-])만 쓰도록 해시한다 */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export interface RentAdd {
  req_id: string;
  amount: number;
  date: string;
  merchant: string;
  label: string;
}

/** 같은 날 같은 호실·금액이 두 번 입금돼도 별개 건으로 반영되도록 순번을 붙인다 */
export function buildRentAdds(rows: RentPayment[]): RentAdd[] {
  const seen = new Map<string, number>();
  return rows.map((p) => {
    const base = `${p.date}|${p.building}|${p.room}|${p.amount}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const where = [p.building, p.room].filter(Boolean).join(' ');
    return {
      req_id: `rent:${p.date.replace(/-/g, '')}:${hash(base)}:${n}`,
      amount: p.amount,
      date: p.date,
      merchant: `${where || '월세'} 월세`.trim(),
      label: `${p.date} ${where || '(호실 없음)'} ${p.amount.toLocaleString('ko-KR')}원`,
    };
  });
}

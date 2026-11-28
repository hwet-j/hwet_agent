/** LeaseLog 호실 현황(스냅샷 rooms)에서 만기 임박·납부일·캘린더 일정을 계산한다. 세입자 이름·연락처는 쓰지 않는다 */
export interface RoomRow { building: string; room: string; end: string; payDay: number | null }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const EXPIRY_STAGES = [60, 30, 14, 7, 0] as const;

/** 스냅샷의 rooms 데이터(배열 또는 {items})에서 입주 중인 호실만 뽑는다 */
export function occupiedRooms(data: unknown): RoomRow[] {
  const list = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown })?.items) ? (data as { items: unknown[] }).items : [];
  const out: RoomRow[] = [];
  for (const r of list) {
    const o = r as Record<string, unknown>;
    if (o?.status !== 'occupied' || typeof o.end !== 'string' || !DATE.test(o.end)) continue;
    out.push({
      building: typeof o.building === 'string' ? o.building : '',
      room: typeof o.room === 'string' ? o.room : '',
      end: o.end,
      payDay: typeof o.payDay === 'number' && o.payDay >= 1 && o.payDay <= 31 ? o.payDay : null,
    });
  }
  return out;
}

export const whereOf = (r: Pick<RoomRow, 'building' | 'room'>) => [r.building, r.room].filter(Boolean).join(' ') || '(호실)';
export const roomKey = (r: RoomRow) => `${r.building}|${r.room}|${r.end}`;

const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const daysUntil = (today: string, end: string) => Math.round((utc(end) - utc(today)) / 86_400_000);

export type Stages = Record<string, number>; // roomKey → 이미 알린 가장 작은 단계

/**
 * 만기 단계(60·30·14·7·0일 전)에 새로 들어선 호실. 알림을 하루 놓쳐도(앱이 꺼져 있었어도) 다음 실행에서 한 번 알린다.
 * 반환 stages 는 알린 뒤 저장할 값(알림에 성공했을 때만 저장할 것).
 */
export function expiryDue(rooms: RoomRow[], today: string, stages: Stages): { items: { where: string; daysLeft: number }[]; stages: Stages } {
  const next: Stages = { ...stages };
  const items: { where: string; daysLeft: number }[] = [];
  for (const r of rooms) {
    const left = daysUntil(today, r.end);
    if (left < 0 || left > EXPIRY_STAGES[0]) continue;
    const stage = [...EXPIRY_STAGES].reverse().find((s) => left <= s) as number; // left 이상인 가장 작은 단계
    const key = roomKey(r);
    if (key in stages && stages[key] <= stage) continue;
    next[key] = stage;
    items.push({ where: whereOf(r), daysLeft: left });
  }
  items.sort((a, b) => a.daysLeft - b.daysLeft);
  return { items, stages: next };
}

/** 오늘이 납부일인 호실 (납부일이 그 달에 없으면 말일로 본다: 31일 → 30일·28일) */
export function payDayToday(rooms: RoomRow[], today: string): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return rooms.filter((r) => r.payDay !== null && Math.min(r.payDay, last) === d).map(whereOf);
}

/** 구글 캘린더에 넣을 만기 일정 (한 번만 만들도록 key 로 기억) */
export function leaseCalendarEvents(rooms: RoomRow[], today: string, horizonDays = 365): { key: string; title: string; start: string; notes: string }[] {
  return rooms
    .filter((r) => { const left = daysUntil(today, r.end); return left >= 0 && left <= horizonDays; })
    .map((r) => ({ key: roomKey(r), title: `[월세] ${whereOf(r)} 계약 만기`, start: r.end, notes: 'LeaseLog 계약 만기일이에요. 갱신·퇴실 여부를 확인하세요.' }));
}

import { kvGet, kvSet } from '@/core/db';
import { addEvent } from '@/integrations/google/calendar';
import { isGoogleConnected } from '@/integrations/google/auth';
import { readSnapshot } from '@/integrations/snapshot';
import { pickLeaselog } from '@/integrations/snapshotPure';
import { leaseCalendarEvents, occupiedRooms } from './leasePure';

const ON_KEY = 'lease_calendar';
const DONE_KEY = 'lease_calendar_done';

export const getLeaseCalendar = async () => (await kvGet(ON_KEY)) === '1';
export const setLeaseCalendar = (v: boolean) => kvSet(ON_KEY, v ? '1' : '0');

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * LeaseLog 계약 만기일(1년 안)을 구글 캘린더에 종일 일정으로 한 번씩 만든다.
 * 한 번 만든 건 기억해 두어 중복으로 만들지 않고, 사용자가 일정을 지워도 다시 만들지 않는다.
 * 구글 연결이 없거나 설정이 꺼져 있으면 아무것도 하지 않는다. 만든 건수를 돌려준다.
 */
export async function syncLeaseCalendar(): Promise<number> {
  if (!(await getLeaseCalendar()) || !(await isGoogleConnected())) return 0;
  const s = await readSnapshot('leaselog');
  if (!s.ok) return 0;
  const p = pickLeaselog(s.snapshot, { what: 'rooms' });
  if (!p.ok) return 0;
  let done: string[] = [];
  try { done = JSON.parse((await kvGet(DONE_KEY)) ?? '[]'); } catch { done = []; }
  const seen = new Set(done);
  let created = 0;
  for (const e of leaseCalendarEvents(occupiedRooms(p.data), ymd(new Date()))) {
    if (seen.has(e.key)) continue;
    try {
      await addEvent({ title: e.title, start: e.start, allDay: true, notes: e.notes });
      seen.add(e.key);
      created++;
    } catch {
      break; // 구글 오류(만료 등)면 다음 실행에서 다시 시도
    }
  }
  if (created) await kvSet(DONE_KEY, JSON.stringify([...seen].slice(-500)));
  return created;
}

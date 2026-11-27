/**
 * RoutineLog(복약·영양제·습관 기록 앱) 연동의 순수 로직.
 * 앱의 ContentProvider 가 돌려주는 루틴·기록 원본에서 "오늘 해야 할 것", 달성률, 연속 일수를 계산한다.
 * (앱과 같은 규칙: 요일 비트마스크 월=1 … 일=64, N일마다는 시작일 기준, 주 N회는 주간 진행)
 */
export const AUTHORITY = 'com.hwetj.routinelog.assistant';

export type Routine = {
  id: string; name: string; kind: 'medication' | 'supplement' | 'habit'; detail?: string | null;
  schedule: 'daily' | 'weekdays' | 'interval' | 'weekly_count'; weekdays?: number; interval_days?: number | null; weekly_count?: number | null;
  start_date: string; end_date?: string | null; daily_target?: number; unit?: string | null;
  times?: { time: string; label?: string | null }[]; archived?: number | boolean;
};
export type Log = {
  id: string; routine: string; routine_id?: string; date: string; slot?: string | null; status: 'done' | 'skipped';
  count?: number; value?: number | null; note?: string | null; logged_at?: string; source?: string;
};
export type RoutineQuery = { today: string; routines: Routine[]; logs: Log[]; truncated?: boolean };

const DAY = 86_400_000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(utc(d) + n * DAY);
const diffDays = (a: string, b: string) => Math.round((utc(b) - utc(a)) / DAY);
/** 월=1 … 일=64 */
const bit = (d: string) => 1 << ((new Date(utc(d)).getUTCDay() + 6) % 7);

/** 그 날짜에 이 루틴이 해당되는지 (주 N회 루틴은 매일 해당으로 보고 주간 진행으로 따로 본다) */
export function isDue(r: Routine, date: string): boolean {
  if (r.archived) return false;
  if (date < r.start_date || (r.end_date && date > r.end_date)) return false;
  switch (r.schedule) {
    case 'daily': return true;
    case 'weekdays': return ((r.weekdays ?? 127) & bit(date)) !== 0;
    case 'interval': return !!r.interval_days && diffDays(r.start_date, date) % r.interval_days === 0;
    case 'weekly_count': return true;
    default: return false;
  }
}

export type Item = {
  routine: string; kind: Routine['kind']; detail?: string | null; slot?: string; label?: string | null;
  status: 'done' | 'skipped' | 'pending' | 'overdue'; done?: number; target?: number; unit?: string | null; at?: string;
};

/** date 의 해야 할 일. now 를 주면 이미 지난 시각(또는 지난 날)의 미체크는 overdue */
export function dayItems(q: Pick<RoutineQuery, 'routines' | 'logs'>, date: string, now?: { today: string; hm: string }): Item[] {
  const out: Item[] = [];
  for (const r of q.routines) {
    if (!isDue(r, date)) continue;
    const logs = q.logs.filter((l) => l.routine === r.name && l.date === date);
    if (r.kind === 'habit') {
      const target = r.daily_target ?? 1;
      const done = logs.filter((l) => l.status === 'done').reduce((s, l) => s + (l.count ?? 1), 0);
      out.push({ routine: r.name, kind: r.kind, detail: r.detail, status: done >= target ? 'done' : 'pending', done, target, unit: r.unit });
      continue;
    }
    for (const t of r.times ?? []) {
      const l = logs.find((x) => x.slot === t.time);
      const late = !!now && (date < now.today || (date === now.today && t.time < now.hm));
      const status: Item['status'] = l ? l.status : late ? 'overdue' : 'pending';
      out.push({ routine: r.name, kind: r.kind, detail: r.detail, slot: t.time, label: t.label, status, ...(l?.logged_at ? { at: l.logged_at } : {}) });
    }
  }
  return out.sort((a, b) => (a.slot ?? '99:99').localeCompare(b.slot ?? '99:99') || a.routine.localeCompare(b.routine));
}

/** 그 날의 완료 여부: 해당일이 아니면 null(휴식), 모든 슬롯/목표를 채웠으면 true */
export function dayComplete(q: Pick<RoutineQuery, 'logs'>, r: Routine, date: string): boolean | null {
  if (!isDue(r, date) || r.schedule === 'weekly_count') return null;
  const logs = q.logs.filter((l) => l.routine === r.name && l.date === date);
  if (r.kind === 'habit') return logs.filter((l) => l.status === 'done').reduce((s, l) => s + (l.count ?? 1), 0) >= (r.daily_target ?? 1);
  const slots = r.times ?? [];
  return slots.length > 0 && slots.every((t) => logs.some((l) => l.slot === t.time && l.status === 'done'));
}

/** 연속 일수: 해당일이 아닌 날은 건너뛰고, 오늘이 아직 미완료여도 끊지 않는다 */
export function streaks(q: Pick<RoutineQuery, 'logs'>, r: Routine, today: string, windowDays: number) {
  let current = 0, longest = 0, run = 0, counting = true, due = 0, done = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = addDays(today, -i);
    if (d < r.start_date) break;
    const c = dayComplete(q, r, d);
    if (c === null) continue;
    if (i === 0 && !c) continue; // 오늘 진행 중
    due++;
    if (c) { done++; run++; longest = Math.max(longest, run); if (counting) current = run; }
    else { run = 0; counting = false; }
  }
  return { current, longest, due, done, rate: due ? Math.round((done / due) * 1000) / 10 : null };
}

/** 주 N회 루틴: 이번 주(월~일) 완료 일수 */
export function weeklyProgress(q: Pick<RoutineQuery, 'logs'>, r: Routine, today: string): { done: number; target: number } | null {
  if (r.schedule !== 'weekly_count') return null;
  const dow = (new Date(utc(today)).getUTCDay() + 6) % 7;
  const monday = addDays(today, -dow);
  const days = new Set(q.logs.filter((l) => l.routine === r.name && l.status === 'done' && l.date >= monday && l.date <= today).map((l) => l.date));
  return { done: days.size, target: r.weekly_count ?? 1 };
}

/** 최근 기간 통계 (루틴별) */
export function summarizeRoutines(q: RoutineQuery, windowDays: number) {
  const since = addDays(q.today, -(windowDays - 1));
  return q.routines.filter((r) => !r.archived).map((r) => {
    const logs = q.logs.filter((l) => l.routine === r.name && l.date >= since);
    const s = streaks(q, r, q.today, windowDays);
    const values = logs.filter((l) => l.status === 'done' && typeof l.value === 'number');
    return {
      routine: r.name, kind: r.kind, ...s, skipped: logs.filter((l) => l.status === 'skipped').length,
      week: weeklyProgress(q, r, q.today) ?? undefined,
      ...(values.length ? { valueTotal: Math.round(values.reduce((a, l) => a + (l.value as number), 0) * 100) / 100, unit: r.unit ?? undefined } : {}),
      recentNotes: logs.filter((l) => l.note).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map((l) => ({ date: l.date, note: l.note, value: l.value ?? undefined })),
    };
  });
}

// ---- 요청 검증
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, f: string, max: number) => {
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string') throw new Error(`${f} 는 문자열이어야 해요`);
  const t = v.trim();
  return t ? t.slice(0, max) : undefined;
};

export function buildLogArgs(i: Record<string, unknown>, reqId: string) {
  const routine = str(i.routine, 'routine', 80);
  if (!routine) throw new Error('routine(루틴 이름)이 필요해요');
  const out: Record<string, unknown> = { req_id: reqId, routine };
  const date = str(i.date, 'date', 10);
  if (date) { if (!DATE.test(date)) throw new Error('date 는 YYYY-MM-DD 형식이어야 해요'); out.date = date; }
  const slot = str(i.slot, 'slot', 20);
  if (slot) out.slot = slot;
  if (slot && /^\d{1,2}:\d{2}$/.test(slot) && !TIME.test(slot.padStart(5, '0'))) throw new Error('slot 시각이 올바르지 않아요');
  if (i.status != null) {
    if (i.status !== 'done' && i.status !== 'skipped') throw new Error('status 는 done 또는 skipped 여야 해요');
    out.status = i.status;
  }
  if (i.count != null) {
    if (typeof i.count !== 'number' || !Number.isInteger(i.count) || i.count < 1 || i.count > 1000) throw new Error('count 는 1~1000 정수여야 해요');
    out.count = i.count;
  }
  if (i.value != null) {
    if (typeof i.value !== 'number' || !Number.isFinite(i.value)) throw new Error('value 는 숫자여야 해요');
    out.value = i.value;
  }
  const note = str(i.note, 'note', 500);
  if (note) out.note = note;
  return out;
}

/** 루틴 추가 폼을 미리 채우는 딥링크 경로 (저장은 사용자가 앱에서) */
export function buildAddPath(i: Record<string, unknown>): string {
  const name = str(i.name, 'name', 80);
  if (!name) throw new Error('name 이 필요해요');
  const p = new URLSearchParams({ name });
  if (i.kind != null) {
    if (i.kind !== 'medication' && i.kind !== 'supplement' && i.kind !== 'habit') throw new Error('kind 는 medication, supplement, habit 중 하나예요');
    p.set('kind', i.kind);
  }
  if (Array.isArray(i.times)) {
    const times = i.times.map((t) => String(t).padStart(5, '0'));
    if (times.length > 12 || times.some((t) => !TIME.test(t))) throw new Error('times 는 HH:MM 형식 최대 12개여야 해요');
    p.set('times', times.join(','));
  }
  if (i.days != null) {
    if (typeof i.days !== 'string' || !/^[01]{7}$/.test(i.days)) throw new Error('days 는 월~일 7자리 0/1 문자열이어야 해요(예: 1111100)');
    p.set('days', i.days);
  }
  const detail = str(i.detail, 'detail', 120);
  if (detail) p.set('detail', detail);
  return `add?${p.toString().replace(/\+/g, '%20')}`;
}

import type { ThemeColor } from '@/constants/theme';
import type { ActivityRow } from './activity';

export type Filter = 'all' | 'write' | 'read' | 'problem';
export const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'write', label: '변경' },
  { id: 'read', label: '조회' },
  { id: 'problem', label: '실패·거부' },
];

export function filterRows<T extends Pick<ActivityRow, 'kind' | 'status'>>(rows: T[], f: Filter): T[] {
  if (f === 'all') return rows;
  if (f === 'problem') return rows.filter((r) => r.status === 'error' || r.status === 'denied');
  return rows.filter((r) => r.kind === f);
}

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 최근 순으로 정렬된 행을 날짜별로 묶는다 */
export function groupByDay<T extends Pick<ActivityRow, 'ts'>>(rows: T[]): { day: string; data: T[] }[] {
  const out: { day: string; data: T[] }[] = [];
  for (const r of rows) {
    const day = dayOf(r.ts);
    const last = out[out.length - 1];
    if (last && last.day === day) last.data.push(r);
    else out.push({ day, data: [r] });
  }
  return out;
}

const WD = '일월화수목금토';
export function dayLabel(day: string, now: Date = new Date()): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - target.getTime()) / 86_400_000);
  const base = `${m}월 ${d}일 (${WD[target.getDay()]})`;
  return diff === 0 ? `오늘 · ${base}` : diff === 1 ? `어제 · ${base}` : y === now.getFullYear() ? base : `${y}년 ${base}`;
}

export function statusInfo(r: Pick<ActivityRow, 'status' | 'kind'>): { label: string; color: ThemeColor; hint?: string } {
  switch (r.status) {
    case 'ok':
      return { label: r.kind === 'read' ? '조회함' : '완료', color: 'success' };
    case 'handoff':
      return { label: '앱에서 확인 필요', color: 'warn', hint: '다른 앱의 확인 화면만 열었어요. 그 앱에서 저장을 눌러야 반영되고, 저장했는지는 비서가 알 수 없어요.' };
    case 'denied':
      return { label: '거부함', color: 'textSecondary', hint: '확인 창에서 거부해서 실행하지 않았어요.' };
    default:
      return { label: '실패', color: 'danger' };
  }
}

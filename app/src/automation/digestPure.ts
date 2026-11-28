/** 자동 요약 알림(AI 호출 없음): 앱들의 읽기 전용 데이터를 한 줄씩 요약한다 */
export interface DigestInput {
  today: string; // YYYY-MM-DD
  /** LeaseLog 미납·일부납 (null 이면 앱이 없거나 못 읽음) */
  unpaid: { room: string; building?: string; remaining: number; overdue?: boolean }[] | null;
  /** 오늘 일정 */
  events: { title: string; start: string; allDay?: boolean }[] | null;
  /** RoutineLog 오늘 남은(아직·놓친) 약·루틴 */
  routinesLeft: { routine: string; slot?: string; status: 'pending' | 'overdue' }[] | null;
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const hm = (iso: string) => (iso.length > 10 ? iso.slice(11, 16) : '');

export function buildDigest(i: DigestInput): { title: string; body: string; empty: boolean } {
  const lines: string[] = [];

  if (i.events?.length) {
    const sorted = [...i.events].sort((a, b) => a.start.localeCompare(b.start));
    const shown = sorted.slice(0, 3).map((e) => `${e.allDay ? '종일' : hm(e.start)} ${e.title}`.trim());
    lines.push(`일정 ${i.events.length}건: ${shown.join(' · ')}${i.events.length > 3 ? ` 외 ${i.events.length - 3}건` : ''}`);
  }

  if (i.routinesLeft?.length) {
    const late = i.routinesLeft.filter((r) => r.status === 'overdue').length;
    const shown = i.routinesLeft.slice(0, 3).map((r) => `${r.slot ?? ''} ${r.routine}`.trim());
    lines.push(`복약·루틴 ${i.routinesLeft.length}건 남음${late ? `(놓친 ${late})` : ''}: ${shown.join(' · ')}${i.routinesLeft.length > 3 ? ' …' : ''}`);
  }

  if (i.unpaid?.length) {
    const total = i.unpaid.reduce((s, u) => s + (u.remaining || 0), 0);
    const over = i.unpaid.filter((u) => u.overdue).length;
    const shown = i.unpaid.slice(0, 3).map((u) => [u.building, u.room].filter(Boolean).join(' '));
    lines.push(`월세 미납 ${i.unpaid.length}건${over ? `(연체 ${over})` : ''} · ${won(total)}: ${shown.join(', ')}${i.unpaid.length > 3 ? ' …' : ''}`);
  }

  if (!lines.length) return { title: '오늘의 요약', body: '오늘은 챙길 일정·복약·미납이 없어요.', empty: true };
  return { title: '오늘의 요약', body: lines.join('\n'), empty: false };
}

/** 지금이 알림 시각 이후이고 오늘 아직 안 보냈는지 */
export function isDue(now: { date: string; hour: number; minute: number }, s: { enabled: boolean; hour: number; minute: number; lastSent?: string }): boolean {
  if (!s.enabled || s.lastSent === now.date) return false;
  return now.hour * 60 + now.minute >= s.hour * 60 + s.minute;
}

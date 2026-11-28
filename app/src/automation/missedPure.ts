/** 놓친 복약·루틴 재알림: 정한 시각에서 유예 시간이 지났는데 체크가 없으면 한 번만 알린다 */
export interface MissedItem { routine: string; slot?: string; status: string }

const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

export const missedKey = (date: string, i: MissedItem) => `${date}|${i.slot ?? ''}|${i.routine}`;

/** 알릴 항목: 시각이 있는 것(복약·영양제) 중 overdue 이고 유예가 지났고 아직 알리지 않은 것 */
export function missedDue(items: MissedItem[], date: string, nowHm: string, notified: Set<string>, graceMin = 30): MissedItem[] {
  const now = toMin(nowHm);
  return items.filter((i) => i.status === 'overdue' && !!i.slot && now - toMin(i.slot) >= graceMin && !notified.has(missedKey(date, i)));
}

export function missedMessage(list: MissedItem[]): { title: string; body: string } {
  const shown = list.slice(0, 3).map((i) => `${i.slot} ${i.routine}`);
  return { title: '아직 체크 안 한 약이 있어요', body: `${shown.join(' · ')}${list.length > 3 ? ` 외 ${list.length - 3}건` : ''}\n먹었다면 RoutineLog 나 비서에서 체크해 주세요.` };
}

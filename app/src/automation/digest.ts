import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { kvGet, kvSet } from '@/core/db';
import { callProvider } from '../../modules/assistant-bridge';
import { readSnapshot } from '@/integrations/snapshot';
import { pickCalendar, pickLeaselog } from '@/integrations/snapshotPure';
import { AUTHORITY as ROUTINE_AUTHORITY, dayItems, type RoutineQuery } from '@/integrations/routinelog/pure';
import { buildDigest, isDue, type DigestInput } from './digestPure';

export type DigestSettings = { enabled: boolean; hour: number; minute: number; lastSent?: string };
const DEFAULT: DigestSettings = { enabled: false, hour: 8, minute: 0 };
const KEY = 'auto_digest';
const CHANNEL = 'auto_digest';

export async function getDigestSettings(): Promise<DigestSettings> {
  const raw = await kvGet(KEY);
  if (!raw) return DEFAULT;
  try {
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}
export const setDigestSettings = (s: DigestSettings) => kvSet(KEY, JSON.stringify(s));

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 각 앱을 앱 화면을 열지 않고 읽는다. 어느 하나가 실패해도(앱 없음·구버전) 나머지로 만든다 */
export async function gatherDigestInput(now = new Date()): Promise<DigestInput> {
  const today = ymd(now);
  const out: DigestInput = { today, unpaid: null, events: null, routinesLeft: null };

  try {
    const s = await readSnapshot('leaselog');
    if (s.ok) {
      const p = pickLeaselog(s.snapshot, { what: 'unpaid' });
      if (p.ok) {
        const d = p.data as any;
        const items: any[] = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : [];
        out.unpaid = items.map((u) => ({ room: String(u.room ?? ''), building: u.building ? String(u.building) : undefined, remaining: Number(u.remaining) || 0, overdue: !!u.overdue }));
      }
    }
  } catch { /* LeaseLog 없음 */ }

  try {
    const s = await readSnapshot('calendar');
    if (s.ok) {
      const p = pickCalendar(s.snapshot, { from: today, to: today });
      if (p.ok) out.events = ((p.data as any).events as any[]).map((e) => ({ title: String(e.title ?? ''), start: String(e.start), allDay: String(e.start).length <= 10 }));
    }
  } catch { /* 캘린더 앱 없음 */ }

  try {
    const r = await callProvider(ROUTINE_AUTHORITY, 'query', { from: today, to: today });
    if (!r.error && r.json) {
      const q = JSON.parse(r.json) as RoutineQuery;
      const items = dayItems(q, today, { today, hm: `${pad(now.getHours())}:${pad(now.getMinutes())}` });
      out.routinesLeft = items
        .filter((x) => x.status === 'pending' || x.status === 'overdue')
        .map((x) => ({ routine: x.routine, slot: x.slot, status: x.status as 'pending' | 'overdue' }));
    }
  } catch { /* RoutineLog 없음 */ }

  return out;
}

/** 알림 시각이 지났고 오늘 아직 안 보냈다면 요약 알림을 지금 보낸다. 보냈으면 true */
export async function sendDigestIfDue(now = new Date()): Promise<boolean> {
  const s = await getDigestSettings();
  if (!isDue({ date: ymd(now), hour: now.getHours(), minute: now.getMinutes() }, s)) return false;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return false;
  // 먼저 표시해 두어 동시에 두 번 실행돼도 한 번만 보낸다
  await setDigestSettings({ ...s, lastSent: ymd(now) });
  const d = buildDigest(await gatherDigestInput(now));
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, { name: '오늘의 요약', importance: AndroidImportance.DEFAULT });
  }
  await Notifications.scheduleNotificationAsync({
    content: { title: d.title, body: d.body, data: { type: 'auto_digest' } },
    trigger: { channelId: CHANNEL },
  });
  return true;
}

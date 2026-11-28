import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { kvGet, kvSet } from '@/core/db';
import { callProvider } from '../../modules/assistant-bridge';
import { AUTHORITY as ROUTINE_AUTHORITY, dayItems, type RoutineQuery } from '@/integrations/routinelog/pure';
import { missedDue, missedKey, missedMessage } from './missedPure';

const ON_KEY = 'missed_reminder';
const SEEN_KEY = 'missed_notified';
const CHANNEL = 'missed_dose';

export const getMissedReminder = async () => (await kvGet(ON_KEY)) === '1';
export const setMissedReminder = (v: boolean) => kvSet(ON_KEY, v ? '1' : '0');

const pad = (n: number) => String(n).padStart(2, '0');

/** 놓친 복약이 있으면 알린다(항목마다 한 번). 보냈으면 true */
export async function sendMissedIfAny(now = new Date()): Promise<boolean> {
  if (!(await getMissedReminder())) return false;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return false;
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const r = await callProvider(ROUTINE_AUTHORITY, 'query', { from: date, to: date });
  if (r.error || !r.json) return false;
  const items = dayItems(JSON.parse(r.json) as RoutineQuery, date, { today: date, hm });
  let seen: { date: string; keys: string[] } = { date, keys: [] };
  try { const v = JSON.parse((await kvGet(SEEN_KEY)) ?? ''); if (v?.date === date) seen = v; } catch { /* 새로 시작 */ }
  const due = missedDue(items, date, hm, new Set(seen.keys));
  if (!due.length) return false;
  // 먼저 기록해 두어 동시에 두 번 실행돼도 한 번만 보낸다
  await kvSet(SEEN_KEY, JSON.stringify({ date, keys: [...seen.keys, ...due.map((i) => missedKey(date, i))] }));
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: '놓친 복약 알림', importance: AndroidImportance.HIGH });
  const m = missedMessage(due);
  await Notifications.scheduleNotificationAsync({ content: { title: m.title, body: m.body, data: { type: 'missed_dose' } }, trigger: { channelId: CHANNEL } });
  return true;
}

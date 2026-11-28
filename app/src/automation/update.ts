import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { kvGet, kvSet } from '@/core/db';
import { latestAssistantRelease, shouldNotify } from './updatePure';

const ON_KEY = 'update_notify';
const SEEN_KEY = 'update_notified';
const CHANNEL = 'app_update';
const API = 'https://api.github.com/repos/hwet-j/hwet_agent/releases?per_page=30';
export const RELEASES_PAGE = 'https://github.com/hwet-j/hwet_agent/releases/tag/apps-latest';

export const getUpdateNotify = async () => (await kvGet(ON_KEY)) === '1';
export const setUpdateNotify = (v: boolean) => kvSet(ON_KEY, v ? '1' : '0');

/** 이 빌드의 번호 (CI 가 EXPO_PUBLIC_BUILD_NUMBER 로 넣는다. 개발 빌드는 0) */
export const ownBuildNumber = () => Number(process.env.EXPO_PUBLIC_BUILD_NUMBER ?? 0) || 0;

/** 새 버전이 있으면 한 번만 알린다(같은 번호는 다시 알리지 않음). 보냈으면 true */
export async function notifyIfNewVersion(): Promise<boolean> {
  if (!(await getUpdateNotify())) return false;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return false;
  const res = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return false;
  const latest = latestAssistantRelease(await res.json());
  const notified = Number((await kvGet(SEEN_KEY)) ?? 0) || 0;
  if (!shouldNotify(ownBuildNumber(), latest, notified) || !latest) return false;
  await kvSet(SEEN_KEY, String(latest.n)); // 먼저 기록해 두 번 보내지 않게
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, { name: '새 버전 알림', importance: AndroidImportance.DEFAULT });
  await Notifications.scheduleNotificationAsync({
    content: { title: '비서 앱 새 버전이 있어요', body: `빌드 #${latest.n} — 눌러서 받는 곳을 열어요. (설치하면 데이터는 그대로 유지돼요)`, data: { type: 'update', url: RELEASES_PAGE } },
    trigger: { channelId: CHANNEL },
  });
  return true;
}

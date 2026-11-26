import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

import { kvGet, kvSet } from './db';
import type { BriefingSettings } from './settings';

export const BRIEFING_PROMPT =
  '아침 브리핑을 해 주세요. 오늘 날짜, 남은 할 일(마감 임박 순), 최근 메모 중 중요한 것을 짧게 정리해 주세요.';

const CHANNEL = 'briefing';

/** 브리핑은 선택 기능이다. 켜면 매일 지정한 시각에 로컬 알림을 보내고, 알림을 열면 브리핑을 생성한다. */
export async function applyBriefing(s: BriefingSettings): Promise<{ ok: boolean; reason?: string }> {
  const prevId = await kvGet('briefing_notification_id');
  if (prevId) {
    await Notifications.cancelScheduledNotificationAsync(prevId).catch(() => {});
    await kvSet('briefing_notification_id', '');
  }
  if (!s.enabled) return { ok: true };

  const perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return { ok: false, reason: '알림 권한이 허용되지 않았어요. 설정에서 허용해 주세요.' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: '아침 브리핑',
      importance: AndroidImportance.DEFAULT,
    });
  }
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: '아침 브리핑', body: '눌러서 오늘 일정과 할 일을 확인하세요.', data: { type: 'briefing' } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: s.hour,
      minute: s.minute,
      channelId: CHANNEL,
    },
  });
  await kvSet('briefing_notification_id', id);
  return { ok: true };
}

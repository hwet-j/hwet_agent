import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { sendDigestIfDue } from './digest';
import { syncLeaseCalendar } from './leaseCalendar';
import { sendMissedIfAny } from './missed';
import { notifyIfNewVersion } from './update';

export const AUTO_TASK = 'auto-digest';

// 앱이 꺼져 있어도 시스템이 주기적으로(최소 15분, 정확하지 않음) 깨워 준다. 정의는 앱 시작 시 한 번 실행되어야 한다
TaskManager.defineTask(AUTO_TASK, async () => {
  try {
    await sendDigestIfDue();
    await syncLeaseCalendar().catch(() => {});
    await sendMissedIfAny().catch(() => {});
    await notifyIfNewVersion().catch(() => {});
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** 요약 알림을 켜면 주기 작업을 등록하고, 끄면 해제한다 */
export async function syncAutoTask(enabled: boolean): Promise<void> {
  const registered = await TaskManager.isTaskRegisteredAsync(AUTO_TASK);
  if (enabled && !registered) await BackgroundTask.registerTaskAsync(AUTO_TASK, { minimumInterval: 15 });
  if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(AUTO_TASK);
}

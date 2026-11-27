import { fetchSnapshot } from '../../modules/assistant-bridge';
import { parseSnapshot, type Snapshot } from './snapshotPure';

export const AUTHORITY = {
  leaselog: 'com.rentmanager.app.assistant',
  calendar: 'com.hwetj.calendar.assistant',
} as const;

export type SnapshotResult =
  | { ok: true; snapshot: Snapshot }
  | { ok: false; reason: 'unavailable' | 'no_snapshot' | 'forbidden' | 'invalid' };

/** 앱을 열지 않고 읽기 전용 스냅샷을 가져온다. 앱이 없거나 구버전이면 reason 으로 알려 준다. */
export async function readSnapshot(app: keyof typeof AUTHORITY): Promise<SnapshotResult> {
  const raw = await fetchSnapshot(AUTHORITY[app]);
  if (raw.error === 'no_snapshot') return { ok: false, reason: 'no_snapshot' };
  if (raw.error === 'forbidden') return { ok: false, reason: 'forbidden' };
  if (raw.error || !raw.json) return { ok: false, reason: 'unavailable' };
  const snapshot = parseSnapshot(raw.json, app);
  return snapshot ? { ok: true, snapshot } : { ok: false, reason: 'invalid' };
}

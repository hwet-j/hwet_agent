import { callProvider, fetchSnapshot } from '../../modules/assistant-bridge';
import { isGoogleConnected } from './google/auth';
import { AUTHORITY as FL } from './flowledger/pure';
import { AUTHORITY as SNAP } from './snapshot';
import { statusFromError, type AppStatus } from './statusPure';

/** 앱을 열지 않고 제공자를 호출해 연결 상태와 마지막 데이터 시각을 확인한다 */
export async function probeApp(id: 'leaselog' | 'calendar' | 'flowledger'): Promise<AppStatus> {
  if (id === 'flowledger') {
    const today = new Date().toLocaleDateString('sv-SE');
    const r = await callProvider(FL, 'query', { from: today, to: today, limit: 1 });
    const st = statusFromError(r.error);
    if (st.state !== 'ready') return st;
    try {
      return { state: 'ready', ts: JSON.parse(r.json ?? '{}').ts };
    } catch {
      return st;
    }
  }
  const r = await fetchSnapshot(SNAP[id]);
  const st = statusFromError(r.error);
  return st.state === 'ready' ? { state: 'ready', ts: r.ts || undefined } : st;
}

export const probeGoogle = isGoogleConnected;

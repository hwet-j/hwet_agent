import { callProvider, fetchSnapshot } from '../../modules/assistant-bridge';
import { isGoogleConnected } from './google/auth';
import { AUTHORITY as FL } from './flowledger/pure';
import { AUTHORITY as RL } from './routinelog/pure';
import { AUTHORITY as SNAP } from './snapshot';
import { statusFromError, type AppStatus } from './statusPure';

/** 앱을 열지 않고 제공자를 호출해 연결 상태와 마지막 데이터 시각을 확인한다 */
export async function probeApp(id: 'leaselog' | 'calendar' | 'flowledger' | 'routinelog'): Promise<AppStatus> {
  if (id === 'flowledger' || id === 'routinelog') {
    // DB 를 여는 query 로 상태를 확인하면 안 된다: 상대 앱이 이미 DB 를 열고 있을 때 SQLite 파일 잠금이 깨질 수 있다.
    // 'ping' 은 DB 를 건드리지 않는다. 구버전 앱은 ping 을 모르므로(unknown_method) 설치만 확인된 것으로 본다.
    const r = await callProvider(id === 'flowledger' ? FL : RL, 'ping', {});
    if (r.error === 'unknown_method') return { state: 'ready' };
    const st = statusFromError(r.error);
    if (st.state !== 'ready') return st;
    try {
      const j = JSON.parse(r.json ?? '{}');
      return j.db === false ? { state: 'needs_launch' } : { state: 'ready' };
    } catch {
      return st;
    }
  }
  const r = await fetchSnapshot(SNAP[id]);
  const st = statusFromError(r.error);
  return st.state === 'ready' ? { state: 'ready', ts: r.ts || undefined } : st;
}

export const probeGoogle = isGoogleConnected;

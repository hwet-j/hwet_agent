/** 연동 앱 상태: 비서가 앱의 제공자(ContentProvider)를 호출해 본 결과를 사람이 읽을 상태로 바꾼다 */
export type AppState = 'ready' | 'needs_launch' | 'missing' | 'denied' | 'unknown';
export type AppStatus = { state: AppState; ts?: number };

export const statusFromError = (error?: string | null): AppStatus => {
  switch (error) {
    case undefined:
    case null:
    case '':
      return { state: 'ready' };
    case 'no_snapshot':
    case 'no_db':
      return { state: 'needs_launch' };
    case 'forbidden':
      return { state: 'denied' };
    case 'unavailable':
    case 'not_allowed':
      return { state: 'missing' };
    default:
      return { state: 'unknown' };
  }
};

export const STATE_LABEL: Record<AppState, string> = {
  ready: '연결됨',
  needs_launch: '앱을 한 번 실행해 주세요',
  missing: '설치 안 됨 또는 업데이트 필요',
  denied: '접근 거부됨',
  unknown: '확인 실패',
};

/** "방금", "3분 전", "2시간 전", "어제", "5일 전" */
export function ago(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86_400) return `${Math.floor(s / 3600)}시간 전`;
  const d = Math.floor(s / 86_400);
  return d === 1 ? '어제' : `${d}일 전`;
}

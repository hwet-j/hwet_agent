import type { AgentTool } from './tool';
import type { ActivityKind, ActivityStatus } from '../core/activityTypes';

export type ToolOutcome = 'ok' | 'error' | 'denied';

export const kindOf = (t: Pick<AgentTool, 'readOnly' | 'handoff'>): ActivityKind => (t.readOnly ? 'read' : 'write');

/** 실행 결과 → 기록 상태. 다른 앱 확인 화면을 연 도구는 성공이어도 "앱에서 확인 필요"로 남긴다. */
export function statusOf(t: Pick<AgentTool, 'handoff'>, outcome: ToolOutcome): ActivityStatus {
  if (outcome === 'ok') return t.handoff ? 'handoff' : 'ok';
  return outcome;
}

/** 기록 탭에 보일 한 줄. 도구의 describe 가 있으면 그것, 없으면 라벨 + 값이 짧은 입력 몇 개 */
export function summarize(t: Pick<AgentTool, 'label' | 'describe'>, input: Record<string, unknown>): string {
  if (t.describe) {
    try {
      const d = t.describe(input).trim();
      if (d) return d;
    } catch {
      /* 아래 기본값 */
    }
  }
  const bits = Object.entries(input)
    .filter(([, v]) => (typeof v === 'string' && v.length <= 40) || typeof v === 'number' || typeof v === 'boolean')
    .slice(0, 3)
    .map(([k, v]) => `${k}=${v}`);
  return bits.length ? `${t.label} (${bits.join(', ')})` : t.label;
}

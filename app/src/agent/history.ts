import type Anthropic from '@anthropic-ai/sdk';

export type History = Anthropic.MessageParam[];

const isThinking = (b: { type: string }) => b.type === 'thinking' || b.type === 'redacted_thinking';

/**
 * 끝난 턴의 thinking 블록을 모두 제거한다.
 *
 * Claude 는 thinking 블록을 "만들 때의 system·tools·이전 메시지"에 묶어 서명한다.
 * 이후 요청에서 그 앞부분이 달라지면(예: 시스템 프롬프트의 현재 시각, 연결한 도구 목록 변경) 400 으로 거부한다.
 * 이전 턴의 thinking 은 전부 빼는 것이 허용되므로(중간 것만 빼면 안 됨), 완료된 턴에서는 모두 제거해 보관한다.
 * 같은 턴 안의 도구 호출 반복에서는 이 함수를 쓰지 않고 응답을 그대로 되돌려 보낸다.
 * 입력은 바꾸지 않는다.
 */
export function stripThinking(history: History): History {
  const out: History = [];
  for (const m of history) {
    if (m.role !== 'assistant' || typeof m.content === 'string') {
      out.push(m);
      continue;
    }
    const kept = m.content.filter((b) => !isThinking(b));
    if (kept.length === m.content.length) out.push(m);
    else if (kept.length > 0) out.push({ ...m, content: kept });
    // thinking 만 있던 메시지는 통째로 버린다 (빈 content 는 API 가 거부)
  }
  return out;
}

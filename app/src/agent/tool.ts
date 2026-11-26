/** 에이전트가 호출할 수 있는 도구의 공통 형태. 내장 도구와 연동 앱 도구가 모두 이 형태가 된다. */
export type AgentTool = {
  /** Claude 도구 이름 규칙: [a-zA-Z0-9_-]{1,64} */
  name: string;
  description: string;
  inputSchema: { type: 'object'; [k: string]: unknown };
  /** true 면 실행 전에 사용자에게 확인을 받는다. */
  needsConfirm: boolean;
  /** 확인 창에 보여줄 사람이 읽는 설명 */
  label: string;
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

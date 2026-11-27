/** 에이전트가 호출할 수 있는 도구의 공통 형태. 내장 도구와 연동 앱 도구가 모두 이 형태가 된다. */
export type AgentTool = {
  /** Claude 도구 이름 규칙: [a-zA-Z0-9_-]{1,64} */
  name: string;
  description: string;
  inputSchema: { type: 'object'; [k: string]: unknown };
  /** true 면 실행 전에 사용자에게 확인을 받는다. */
  needsConfirm: boolean;
  /** true 를 돌려주면 needsConfirm 이어도 확인 없이 실행한다 (사용자가 설정에서 "확인 없이 바로"를 켠 경우) */
  skipConfirm?: () => Promise<boolean>;
  /** 확인 창에 보여줄 사람이 읽는 설명 */
  label: string;
  /** 확인 창에 보여줄 사람이 읽는 상세 설명 (예: 삭제할 일정의 제목·시간). 실패하면 입력 JSON 을 대신 보여준다. */
  preview?: (input: Record<string, unknown>) => Promise<string>;
  /** 읽기/조회만 하고 아무것도 바꾸지 않는 도구 (기록 탭에서 "조회"로 분류) */
  readOnly?: boolean;
  /** 다른 앱의 확인 화면을 열기만 하는 도구. 저장은 그 앱에서 사용자가 해야 하므로 기록에 "앱에서 확인 필요"로 남긴다. */
  handoff?: boolean;
  /** 기록 탭에 보여줄 한 줄 설명 (예: "일정 추가: 치과 약속"). 없으면 label 만 */
  describe?: (input: Record<string, unknown>) => string;
  /** 채팅 말풍선 아래에 "앱에서 열기" 버튼을 붙일 때 (대상 앱과 화면). 버튼을 누를 때 링크를 새로 만든다. */
  openLink?: (input: Record<string, unknown>) => OpenLink | null;
  run: (input: Record<string, unknown>) => Promise<unknown>;
};

/** 채팅에서 누르면 연동 앱의 해당 화면을 여는 버튼 */
export type OpenLink =
  | { app: 'leaselog'; label: string; input: Record<string, unknown> }
  | { app: 'calendar'; label: string; date: string }
  | { app: 'flowledger' | 'routinelog'; label: string; path: string };

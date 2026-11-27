/** ok=실행됨 · error=실패 · denied=사용자가 거부 · handoff=다른 앱 확인 화면을 열었음(저장은 그 앱에서) */
export type ActivityStatus = 'ok' | 'error' | 'denied' | 'handoff';
/** read=조회만 · write=무언가 바꿈/만듦 */
export type ActivityKind = 'read' | 'write';

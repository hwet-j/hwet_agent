import { isResultUrl } from '@/integrations/bridgePure';

/**
 * 연동 앱이 돌려주는 조회 결과(hwetassistant://result?...)는 화면 이동이 아니므로 라우터가 무시하게 한다
 * (결과는 루트 레이아웃의 Linking 리스너가 받는다). 그 밖의 주소는 그대로 통과.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  return isResultUrl(path) ? null : path;
}

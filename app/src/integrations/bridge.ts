import { createBridge } from './bridgePure';

/** 앱 전체에서 공유하는 결과 수신기. 루트 레이아웃이 들어오는 주소를 handle() 로 넘긴다. */
export const bridge = createBridge();

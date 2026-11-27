import { requireOptionalNativeModule } from 'expo';

export type RawSnapshot = { json?: string | null; ts?: number; error?: string | null; message?: string | null };

type Native = {
  snapshot(authority: string): Promise<RawSnapshot>;
  call(authority: string, method: string, arg: string | null): Promise<RawSnapshot>;
};

/** 네이티브 모듈이 없는 환경(웹, 테스트)에서는 null */
const native = requireOptionalNativeModule<Native>('AssistantBridge');

export async function fetchSnapshot(authority: string): Promise<RawSnapshot> {
  if (!native) return { error: 'unavailable' };
  try {
    return await native.snapshot(authority);
  } catch {
    return { error: 'unavailable' };
  }
}

/** 제공자의 메서드를 호출한다 (query/add/update/delete …). 앱이 없거나 구버전이면 error: 'unavailable' */
export async function callProvider(authority: string, method: string, arg: unknown): Promise<RawSnapshot> {
  if (!native) return { error: 'unavailable' };
  try {
    return await native.call(authority, method, arg == null ? null : JSON.stringify(arg));
  } catch {
    return { error: 'unavailable' };
  }
}

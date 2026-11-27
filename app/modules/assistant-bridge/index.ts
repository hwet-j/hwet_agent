import { requireOptionalNativeModule } from 'expo';

export type RawSnapshot = { json?: string | null; ts?: number; error?: string | null };

type Native = { snapshot(authority: string): Promise<RawSnapshot> };

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

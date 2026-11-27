import { requireOptionalNativeModule } from 'expo';

export type VoiceEvent = 'onPartial' | 'onResult' | 'onError' | 'onVolume' | 'onEnd';
type Sub = { remove(): void };
type Native = {
  isAvailable(): boolean;
  start(lang: string): void;
  stop(): void;
  cancel(): void;
  addListener(name: VoiceEvent, cb: (e: any) => void): Sub;
};

/** 네이티브 모듈이 없는 환경(웹, 테스트)에서는 null */
export const VoiceNative = requireOptionalNativeModule<Native>('Voice');

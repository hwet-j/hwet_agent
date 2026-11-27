import { requireOptionalNativeModule } from 'expo';

export type InstalledApp = { label: string; package: string };
type Native = {
  listApps(): InstalledApp[];
  launchApp(pkg: string): boolean;
  playMusic(query: string, pkg: string | null): boolean;
  mediaKey(action: string): boolean;
  setVolume(percent: number): number;
  getVolume(): number;
  setTimer(seconds: number, label: string | null): boolean;
  setAlarm(hour: number, minute: number, label: string | null, days: number[] | null): boolean;
};

/** 네이티브 모듈이 없는 환경(웹, 테스트)에서는 null */
export const LauncherNative = requireOptionalNativeModule<Native>('Launcher');

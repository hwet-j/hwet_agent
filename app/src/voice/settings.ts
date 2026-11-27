import { kvGet, kvSet } from '@/core/db';

export type VoiceSettings = { tts: boolean; relisten: boolean; openListen: boolean };
const K = { tts: 'voice_tts', relisten: 'voice_relisten', openListen: 'voice_open_listen' } as const;

export async function getVoiceSettings(): Promise<VoiceSettings> {
  const [tts, relisten, openListen] = await Promise.all([kvGet(K.tts), kvGet(K.relisten), kvGet(K.openListen)]);
  return { tts: tts !== '0', relisten: relisten === '1', openListen: openListen === '1' };
}

export const setVoiceSetting = (key: keyof VoiceSettings, v: boolean) => kvSet(K[key], v ? '1' : '0');

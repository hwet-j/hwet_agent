import * as SecureStore from 'expo-secure-store';

import { kvGet, kvSet } from './db';

const API_KEY = 'anthropic_api_key';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** API 키는 기기 보안 저장소(Android Keystore 기반)에만 저장한다. DB·로그·코드에 남기지 않는다. */
export const getApiKey = () => SecureStore.getItemAsync(API_KEY);
export const setApiKey = (key: string) => SecureStore.setItemAsync(API_KEY, key.trim());
export const clearApiKey = () => SecureStore.deleteItemAsync(API_KEY);

/** 연동 앱 토큰도 보안 저장소에 둔다 (매니페스트/DB에는 저장하지 않음). */
export const getConnectorToken = (id: string) => SecureStore.getItemAsync(`connector_token_${id}`);
export const setConnectorToken = (id: string, token: string) =>
  SecureStore.setItemAsync(`connector_token_${id}`, token);
export const clearConnectorToken = (id: string) =>
  SecureStore.deleteItemAsync(`connector_token_${id}`);

export async function getModel(): Promise<string> {
  return (await kvGet('model')) ?? DEFAULT_MODEL;
}
export const setModel = (m: string) => kvSet('model', m.trim() || DEFAULT_MODEL);

export type BriefingSettings = { enabled: boolean; hour: number; minute: number };
const BRIEFING_DEFAULT: BriefingSettings = { enabled: false, hour: 8, minute: 0 };

export async function getBriefing(): Promise<BriefingSettings> {
  const raw = await kvGet('briefing');
  if (!raw) return BRIEFING_DEFAULT;
  try {
    return { ...BRIEFING_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return BRIEFING_DEFAULT;
  }
}
export const setBriefing = (b: BriefingSettings) => kvSet('briefing', JSON.stringify(b));

/** 답변을 핵심만 간략하게 (기본 켜짐) */
export async function getBriefReply(): Promise<boolean> {
  return (await kvGet('reply_brief')) !== '0';
}
export const setBriefReply = (v: boolean) => kvSet('reply_brief', v ? '1' : '0');

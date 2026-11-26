import * as SecureStore from 'expo-secure-store';

/** calendar 앱과 같은 범위: 일정 읽기/쓰기 (+ 로그인 표시용 이메일). */
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID;

const TOKEN_KEY = 'google_token';
const EMAIL_KEY = 'google_email';

export type GToken = { accessToken: string; refreshToken?: string; expiresAt: number };

/** 구글 설치형 클라이언트의 리디렉션: "com.googleusercontent.apps.<id>:/oauthredirect" */
export const googleRedirectUri = () =>
  GOOGLE_CLIENT_ID
    ? `com.googleusercontent.apps.${GOOGLE_CLIENT_ID.replace('.apps.googleusercontent.com', '')}:/oauthredirect`
    : undefined;

export const saveToken = (t: GToken) => SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(t));
export const loadToken = async (): Promise<GToken | null> => {
  const raw = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GToken;
  } catch {
    return null;
  }
};
export const getGoogleEmail = () => SecureStore.getItemAsync(EMAIL_KEY);
export const setGoogleEmail = (e: string) => SecureStore.setItemAsync(EMAIL_KEY, e);

export async function clearGoogle() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(EMAIL_KEY);
}

export const isGoogleConnected = async () => (await loadToken()) !== null;

/** 유효한 액세스 토큰. 만료됐으면 리프레시 토큰으로 갱신하고, 불가능하면 null(다시 로그인 필요). */
export async function freshAccessToken(): Promise<string | null> {
  const t = await loadToken();
  if (!t) return null;
  if (t.expiresAt > Date.now() + 60_000) return t.accessToken;
  if (!t.refreshToken || !GOOGLE_CLIENT_ID) return null;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: t.refreshToken,
      }).toString(),
    });
    if (!res.ok) return null;
    const j = await res.json();
    await saveToken({
      accessToken: j.access_token,
      refreshToken: j.refresh_token ?? t.refreshToken,
      expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
    });
    return j.access_token as string;
  } catch {
    return null;
  }
}

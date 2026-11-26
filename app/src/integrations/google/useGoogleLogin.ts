import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, googleRedirectUri, saveToken, setGoogleEmail } from './auth';

WebBrowser.maybeCompleteAuthSession();

/** OAuth 2.0 + PKCE 로그인. 성공하면 토큰을 보안 저장소에 저장하고 이메일(표시용)을 돌려준다. */
export function useGoogleLogin() {
  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');
  const redirectUri = googleRedirectUri() ?? AuthSession.makeRedirectUri();
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID ?? '',
      scopes: GOOGLE_SCOPES,
      redirectUri,
      usePKCE: true,
      extraParams: { access_type: 'offline' },
    },
    discovery,
  );

  return async function login(): Promise<{ email?: string } | null> {
    if (!GOOGLE_CLIENT_ID) throw new Error('구글 클라이언트 ID가 설정되지 않았어요. docs/google-calendar-setup.md 를 따라 설정해 주세요.');
    const res = await promptAsync();
    if (res.type !== 'success' || !discovery || !request?.codeVerifier) return null;
    const tok = await AuthSession.exchangeCodeAsync(
      {
        clientId: GOOGLE_CLIENT_ID,
        code: res.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      },
      discovery,
    );
    await saveToken({
      accessToken: tok.accessToken,
      refreshToken: tok.refreshToken,
      expiresAt: Date.now() + (tok.expiresIn ?? 3600) * 1000,
    });
    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tok.accessToken}` },
    })
      .then((r) => r.json())
      .catch(() => ({}));
    if (info.email) await setGoogleEmail(info.email);
    return { email: info.email as string | undefined };
  };
}

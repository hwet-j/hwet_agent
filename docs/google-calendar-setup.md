# 구글 캘린더 연동 설정

비서가 구글 캘린더를 조회·추가하려면 **비서 앱 전용 OAuth 클라이언트 ID**가 필요합니다.
calendar 앱의 클라이언트 ID는 그 앱의 패키지명·서명에 묶여 있어서 재사용할 수 없습니다.
(사용자 본인의 Google Cloud 계정에서 직접 만들어야 하는 단계입니다.)

## 1. Google Cloud Console
1. 프로젝트 선택(calendar 앱에서 쓰던 프로젝트를 써도 됩니다) → **API 및 서비스 > 라이브러리 > Google Calendar API 사용**
2. **OAuth 동의 화면**: 사용자 유형 *외부*, 범위에 `.../auth/calendar.events` 추가
3. **사용자 인증 정보 > OAuth 클라이언트 ID 만들기** → 유형 **Android**
   - 패키지 이름: `com.hwetj.assistant`
   - SHA-1 인증서 지문: 이 앱을 서명하는 키의 지문 (아래 참고)
4. 발급된 클라이언트 ID(`xxxx.apps.googleusercontent.com`)를 `app/.env` 에 넣기:
   ```
   EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=xxxx.apps.googleusercontent.com
   ```
   이 값은 비밀이 아니지만 `.env` 는 커밋하지 않습니다 (`.env.example` 참고).

## 2. ⚠️ 게시 상태를 "프로덕션"으로
OAuth 동의 화면이 **테스트** 상태이면 구글 정책상 **리프레시 토큰이 7일 뒤 만료**되어 매주 다시 로그인해야 합니다.
개인용이라면 게시 상태를 *프로덕션*으로 바꾸면 됩니다. 구글 검증을 받지 않은 앱은 로그인 때 "확인되지 않은 앱" 경고가 뜨고
사용자 100명 제한이 있지만, 혼자 쓰는 용도로는 문제없습니다.
([구글 문서: Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en))

## 3. SHA-1 지문
- 로컬 개발 빌드: `cd app/android && ./gradlew signingReport` (또는 사용하는 keystore 의 `keytool -list -v`)
- EAS 빌드: `npx eas-cli credentials` 에서 확인
- 나중에 서명 키를 바꾸면 클라이언트 ID 의 SHA-1 도 함께 바꿔야 합니다.

## 4. 동작 방식
- 로그인: OAuth 2.0 + PKCE (`expo-auth-session`). 토큰은 `expo-secure-store` 에만 저장됩니다.
- 비서 도구: `gcal_list_events`(조회, 확인 없음), `gcal_add_event`(추가, 실행 전 확인), `calendar_app_new_event`(캘린더 앱 열기, 저장은 사용자가 누름)
- 캘린더 앱에는 **앱의 다음 동기화 때** 나타납니다.
- 비서가 읽은 일정(제목·시각·장소)은 Claude API 로 전송됩니다. 참석자 이메일 등은 전달하지 않습니다.

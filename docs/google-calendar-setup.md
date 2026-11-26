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
GitHub Actions 가 빌드한 APK 의 **서명 인증서 SHA-1** 이 릴리스 설명(Releases → "비서 APK #N")과 빌드 로그
("Signing certificate fingerprint" 단계)에 출력됩니다. 그 값을 3번의 SHA-1 칸에 넣으세요.
- 클라이언트 ID 를 만든 뒤 저장소 **Settings → Secrets and variables → Actions → Variables** 에
  `GOOGLE_CLIENT_ID_ANDROID` 를 추가하고 워크플로를 다시 실행(Run workflow)하면 구글 연결이 켜진 APK 가 만들어집니다.
- 서명 키를 바꾸면 클라이언트 ID 의 SHA-1 도 함께 바꿔야 합니다. (현재는 Expo 기본 debug 키로 서명되어 빌드마다 같은 지문이 나옵니다.)

## 4. 동작 방식
- 로그인: OAuth 2.0 + PKCE (`expo-auth-session`). 토큰은 `expo-secure-store` 에만 저장됩니다.
- 비서 도구: `gcal_list_events`(조회, 확인 없음), `gcal_add_event`(추가), `gcal_update_event`(수정), `gcal_delete_event`(삭제) — 추가·수정·삭제는 실행 전에 확인 창을 띄우고, 수정·삭제는 **대상 일정의 제목·시간을 보여 줍니다**. `calendar_app_new_event`(캘린더 앱 열기, 저장은 사용자가 누름)
- 수정·삭제는 먼저 조회해서 얻은 일정 id 로만 동작합니다. 반복 일정은 그 회차만 바뀌거나 삭제됩니다. 수정·삭제 시 참석자에게 알림 메일은 보내지 않습니다.
- 캘린더 앱에는 **앱의 다음 동기화 때**(설정 → 동기화) 추가·수정·삭제가 반영됩니다. 삭제 반영은 calendar 앱 PR #4 이후 버전이 필요합니다.
- 비서가 읽은 일정(제목·시각·장소)은 Claude API 로 전송됩니다. 참석자 이메일 등은 전달하지 않습니다.

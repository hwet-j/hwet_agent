# hwet-assistant

내 Android 폰에서 동작하는 개인 AI 비서 앱. Expo(React Native, SDK 58) + Claude API(도구 호출).

## 기능
- **AI 대화**: Claude Messages API, 도구 호출 루프 (`app/src/agent/agent.ts`)
- **할 일 / 메모**: 로컬 SQLite (`app/src/builtin/tools.ts`)
- **내 앱 연동**: 매니페스트(JSON)로 등록한 앱의 기능을 도구로 사용 → [`docs/connector-spec.md`](docs/connector-spec.md)
- **캘린더 연동**: 내 `calendar` 앱에 딥링크로 일정 초안 열기, 구글 캘린더 조회·추가 → [`docs/google-calendar-setup.md`](docs/google-calendar-setup.md)
- **LeaseLog 연동**: "101호 45만원 입금", "박지후 세입자 등록"처럼 말하면 월세 앱 LeaseLog 의 **값이 채워진 확인 화면**을 열어 줍니다. 저장은 LeaseLog 에서 사용자가 직접 누르며, LeaseLog 데이터는 비서로 오지 않습니다 (LeaseLog 1.6.0 이상 필요, 프로토콜은 LeaseLog 저장소 `CLAUDE.md`)
- **아침 브리핑 (선택)**: 설정에서 켜면 매일 지정 시각에 알림, 눌러서 열면 요약 생성 (기본 꺼짐)

## 폰에 설치하기
1. GitHub → **Actions → Build Android APK** 가 끝나면 **Releases**(비서 APK #N)에서 APK 를 받아 설치합니다 (설정에서 "출처를 알 수 없는 앱 설치" 허용).
2. 앱을 열고 **설정 탭에서 Claude API 키**를 입력합니다. (구글 캘린더 연결은 선택 → `docs/google-calendar-setup.md`)
3. 함께 쓰는 앱: LeaseLog 1.6.0 이상(납부·세입자 등록), calendar(딥링크·삭제 동기화).

## 개발
```bash
cd app
npm install
npx expo run:android        # 개발 빌드 (알림 등 네이티브 기능 때문에 Expo Go 대신 권장)
npx tsc --noEmit && npx eslint src && npm test
```
처음 실행하면 **설정 탭에서 Claude API 키를 입력**하세요. 키는 기기 보안 저장소에만 저장됩니다.

## 앱 이름·패키지
임시 이름 `hwet-assistant` / `com.hwetj.assistant` 입니다. 이름은 `app/app.json` 의 `name`, 설치 후에는 바꾸기 어려운
패키지명(`android.package`)은 첫 설치 전에 확정하세요.

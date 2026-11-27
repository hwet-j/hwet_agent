# 연동 규약 (Connector Spec) v1

내가 만든 앱을 비서에 연결하는 방법입니다. 앱은 **할 수 있는 일(tools)** 을 JSON 매니페스트로 공개하고,
비서(Claude)는 사용자의 말을 해석해 해당 도구를 호출합니다.

## 1. 매니페스트

`GET <매니페스트 URL>` (https 만 지원) 이 아래 JSON 을 돌려줘야 합니다.

```json
{
  "id": "asset",
  "name": "자산 관리",
  "version": "1",
  "description": "내 자산 앱",
  "transport": { "type": "http", "baseUrl": "https://example.com/api" },
  "tools": [
    {
      "name": "get_balance",
      "description": "현재 잔액을 조회한다",
      "inputSchema": { "type": "object", "properties": {} },
      "readOnly": true
    },
    {
      "name": "add_expense",
      "description": "지출을 기록한다. amount 는 원 단위 정수.",
      "inputSchema": {
        "type": "object",
        "properties": { "amount": { "type": "integer" }, "memo": { "type": "string" } },
        "required": ["amount"]
      }
    }
  ]
}
```

| 필드 | 규칙 |
|---|---|
| `id` | 소문자로 시작, 소문자·숫자·`_`, 최대 24자. 도구 이름 앞에 `<id>__` 가 붙어 충돌을 막습니다. |
| `tools[].name` | 소문자로 시작, 소문자·숫자·`_`, 최대 32자 |
| `tools[].description` | Claude 가 언제 이 도구를 쓸지 판단하는 근거입니다. 구체적으로 쓰세요. |
| `tools[].inputSchema` | JSON Schema (`type: "object"`) |
| `tools[].readOnly` | `true` 면 확인 없이 실행(조회 전용). **기본 `false` = 실행 전 사용자 확인** |
| `transport.baseUrl` | `https://` 만 허용 |

## 2. 도구 호출

비서는 도구마다 다음 요청을 보냅니다.

```
POST <baseUrl>/tools/<tool name>
Authorization: Bearer <토큰>   (등록 시 토큰을 입력한 경우)
Content-Type: application/json

{ ...inputSchema 에 맞는 입력... }
```

- 성공: HTTP 200 + JSON 본문 (그대로 Claude 에게 전달, 8000자 초과분은 잘림)
- 실패: HTTP 4xx/5xx + 사람이 읽을 수 있는 메시지. Claude 가 오류를 보고 사용자에게 설명합니다.
- 타임아웃: 20초

## 3. 보안 원칙

- 토큰은 기기 보안 저장소(`expo-secure-store`)에만 저장하며 DB·매니페스트에 넣지 않습니다.
- 도구 응답은 Claude 에게 **데이터**로만 전달되며 지시로 취급하지 않도록 시스템 프롬프트에 명시되어 있습니다.
  그래도 앱은 응답에 외부 사용자가 입력한 텍스트를 그대로 싣지 않는 것이 좋습니다.
- 데이터를 바꾸거나 지우는 도구는 `readOnly` 를 생략하세요. 앱 쪽에서도 서버 검증을 하세요.

## 4. 로드맵 (이번 범위 아님)

- Android 네이티브 전송 방식: 같은 서명 키 + `signature` 수준 권한으로 ContentProvider/바운드 서비스 호출
  (서버 없이 기기 안에서 앱끼리 통신). 연동할 앱의 종류가 정해지면 추가합니다.
- 공개 Intent/딥링크, 알림 읽기(`NotificationListenerService`)를 이용한 플레이스토어 앱 연동.

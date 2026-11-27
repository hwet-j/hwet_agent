import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanTranscript, toSpeech } from '../src/voice/speechText.ts';

test('마크다운 기호·링크·표·이모지를 읽기 좋게 정리', () => {
  const md = '## 이번 달 요약\n\n- **식비** 26,000원\n- 쇼핑 80,000원\n1. 첫째 항목\n\n| 분류 | 금액 |\n|---|---|\n| 식비 | 100 |\n자세히는 https://example.com/a 에서 🙂';
  const t = toSpeech(md);
  assert.ok(!/[*#|`]/.test(t));
  assert.ok(!t.includes('http'));
  assert.ok(!t.includes('🙂'));
  assert.match(t, /이번 달 요약\./);
  assert.match(t, /식비 26,000원\./);
  assert.match(t, /1번, 첫째 항목\./);
  assert.ok(!t.includes('분류'), '표는 읽지 않음');
});

test('너무 길면 문장 경계에서 자르고 안내 문구', () => {
  const long = Array.from({ length: 60 }, (_, i) => `이것은 ${i}번째 문장입니다.`).join(' ');
  const t = toSpeech(long, 120);
  assert.ok(t.endsWith('나머지는 화면에서 확인해 주세요.'));
  assert.ok(t.length < 200);
  assert.match(t, /문장입니다\. 나머지는/);
});

test('짧은 답은 그대로, 코드블록 제거, 빈 입력', () => {
  assert.equal(toSpeech('네, 기록했어요'), '네, 기록했어요.');
  assert.equal(toSpeech('```js\nconst a = 1\n```\n끝'), '끝.');
  assert.equal(toSpeech(''), '');
});

test('음성 인식 결과 공백 정리', () => {
  assert.equal(cleanTranscript('  점심   9천원 \n 먹었어 '), '점심 9천원 먹었어');
});

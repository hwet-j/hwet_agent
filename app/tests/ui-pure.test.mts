import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseBlocks, parseInline } from '../src/components/richTextPure.ts';
import { ago, statusFromError } from '../src/integrations/statusPure.ts';

test('인라인: 굵게·코드·일반', () => {
  assert.deepEqual(parseInline('a **b** `c` d'), [{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', code: true }, { text: ' d' }]);
  assert.deepEqual(parseInline('그냥 글'), [{ text: '그냥 글' }]);
  assert.deepEqual(parseInline('**열림'), [{ text: '**열림' }]);
  assert.deepEqual(parseInline(''), [{ text: '' }]);
});

test('블록: 제목·목록·번호·단락·간격', () => {
  const b = parseBlocks('## 요약\n\n- **식비** 26,000원\n- 쇼핑 80,000원\n1. 첫째\n2) 둘째\n\n마무리');
  assert.deepEqual(b.map((x) => x.type), ['h', 'gap', 'li', 'li', 'li', 'li', 'gap', 'p']);
  const li = b[2] as any;
  assert.equal(li.marker, '•');
  assert.deepEqual(li.segs[0], { text: '식비', bold: true });
  assert.equal((b[4] as any).marker, '1.');
  assert.equal((b[5] as any).marker, '2.');
});

test('블록: 표는 고정폭으로, 구분선 제거, 끝 간격 제거', () => {
  const b = parseBlocks('| 분류 | 금액 |\n|---|---|\n| 식비 | 100 |\n\n');
  assert.equal(b.length, 1);
  assert.deepEqual(b[0], { type: 'pre', text: '| 분류 | 금액 |\n| 식비 | 100 |' });
});

test('연동 앱 상태 매핑', () => {
  assert.equal(statusFromError(undefined).state, 'ready');
  assert.equal(statusFromError('no_snapshot').state, 'needs_launch');
  assert.equal(statusFromError('no_db').state, 'needs_launch');
  assert.equal(statusFromError('unavailable').state, 'missing');
  assert.equal(statusFromError('forbidden').state, 'denied');
  assert.equal(statusFromError('이상한값').state, 'unknown');
});

test('경과 시간 표기', () => {
  const now = 1_700_000_000_000;
  assert.equal(ago(now - 5_000, now), '방금');
  assert.equal(ago(now - 5 * 60_000, now), '5분 전');
  assert.equal(ago(now - 3 * 3600_000, now), '3시간 전');
  assert.equal(ago(now - 30 * 3600_000, now), '어제');
  assert.equal(ago(now - 5 * 86_400_000, now), '5일 전');
});

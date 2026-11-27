import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stripThinking, type History } from '../src/agent/history.ts';

const thinking = { type: 'thinking', thinking: '...', signature: 'sig-A' };
const redacted = { type: 'redacted_thinking', data: 'xxx' };
const toolUse = { type: 'tool_use', id: 't1', name: 'list_tasks', input: {} };

test('이전 턴의 thinking·redacted_thinking 은 제거하고 나머지 블록은 그대로 둔다', () => {
  const h = [
    { role: 'user', content: '할 일 알려줘' },
    { role: 'assistant', content: [thinking, toolUse] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '[]' }] },
    { role: 'assistant', content: [redacted, { type: 'text', text: '할 일이 없어요' }] },
  ] as unknown as History;
  const out = stripThinking(h) as any[];
  assert.deepEqual(out[1].content, [toolUse]);
  assert.deepEqual(out[3].content, [{ type: 'text', text: '할 일이 없어요' }]);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], h[0]);
  assert.deepEqual(out[2], h[2]);
});

test('입력을 변경하지 않는다 (진행 중인 턴의 히스토리를 망가뜨리지 않음)', () => {
  const h = [{ role: 'assistant', content: [thinking, { type: 'text', text: 'hi' }] }] as unknown as History;
  const before = JSON.stringify(h);
  stripThinking(h);
  assert.equal(JSON.stringify(h), before);
});

test('thinking 만 있던 assistant 메시지는 빈 content 가 되지 않도록 통째로 버린다', () => {
  const h = [
    { role: 'user', content: 'a' },
    { role: 'assistant', content: [thinking] },
    { role: 'user', content: 'b' },
  ] as unknown as History;
  const out = stripThinking(h);
  assert.equal(out.length, 2);
  assert.ok(out.every((m) => typeof m.content === 'string' || m.content.length > 0));
});

test('문자열 content·thinking 이 없는 메시지는 같은 객체를 돌려준다', () => {
  const h = [
    { role: 'user', content: '안녕' },
    { role: 'assistant', content: '안녕하세요' },
    { role: 'assistant', content: [{ type: 'text', text: 'x' }] },
  ] as unknown as History;
  const out = stripThinking(h);
  assert.deepEqual(out, h);
  assert.equal(out[2], h[2]);
});

/** 답변을 말풍선에 예쁘게 보이기 위한 가벼운 마크다운 해석 (굵게, 코드, 목록, 제목, 표 → 고정폭) */
export type Seg = { text: string; bold?: boolean; code?: boolean };
export type Block =
  | { type: 'p'; segs: Seg[] }
  | { type: 'h'; segs: Seg[] }
  | { type: 'li'; marker: string; segs: Seg[] }
  | { type: 'pre'; text: string }
  | { type: 'gap' };

export function parseInline(s: string): Seg[] {
  const out: Seg[] = [];
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: s.slice(last, i) });
    const tok = m[0];
    out.push(tok.startsWith('**') ? { text: tok.slice(2, -2), bold: true } : { text: tok.slice(1, -1), code: true });
    last = i + tok.length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out.length ? out : [{ text: '' }];
}

export function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let pre: string[] = [];
  const flushPre = () => {
    if (pre.length) blocks.push({ type: 'pre', text: pre.join('\n') });
    pre = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|/.test(line)) {
      // 표: 구분선(|---|)은 버리고 나머지는 고정폭 그대로
      if (!/^\s*\|[\s:|-]+\|?\s*$/.test(line)) pre.push(line.trim());
      continue;
    }
    flushPre();
    if (!line.trim()) {
      if (blocks.length && blocks[blocks.length - 1].type !== 'gap') blocks.push({ type: 'gap' });
      continue;
    }
    let m: RegExpExecArray | null;
    if ((m = /^#{1,4}\s+(.*)$/.exec(line))) blocks.push({ type: 'h', segs: parseInline(m[1]) });
    else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) blocks.push({ type: 'li', marker: '•', segs: parseInline(m[1]) });
    else if ((m = /^\s*(\d{1,2})[.)]\s+(.*)$/.exec(line))) blocks.push({ type: 'li', marker: `${m[1]}.`, segs: parseInline(m[2]) });
    else blocks.push({ type: 'p', segs: parseInline(line.trim()) });
  }
  flushPre();
  while (blocks.length && blocks[blocks.length - 1].type === 'gap') blocks.pop();
  return blocks;
}

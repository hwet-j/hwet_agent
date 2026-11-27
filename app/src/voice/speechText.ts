/** 답변(마크다운)을 음성으로 읽기 좋은 문장으로 바꾼다: 기호·링크·표·이모지 제거, 너무 길면 앞부분만 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;

export function toSpeech(md: string, maxChars = 420): string {
  let t = md.replace(/\r/g, '');
  t = t.replace(/```[\s\S]*?```/g, ' ');
  t = t.split('\n').filter((l) => !/^\s*\|/.test(l)).join('\n'); // 표
  t = t.replace(/https?:\/\/\S+/g, ' ');
  t = t.replace(/^\s*#{1,4}\s+/gm, '');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1');
  t = t.replace(/^\s*[-*•]\s+/gm, '');
  t = t.replace(/^\s*(\d{1,2})[.)]\s+/gm, '$1번, ');
  t = t.replace(EMOJI, '');
  t = t.replace(/[>→↗▲▼]/g, ' ');
  // 줄바꿈은 문장 사이 쉼으로
  t = t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (/[.!?。…]$/.test(l) ? l : `${l}.`)).join(' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return `${(end > maxChars * 0.5 ? cut.slice(0, end + 1) : cut).trim()} 나머지는 화면에서 확인해 주세요.`;
}

/** 음성 인식 결과 정리: 앞뒤 공백, 연속 공백 */
export const cleanTranscript = (s: string) => s.replace(/\s+/g, ' ').trim();

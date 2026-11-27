import { getDb } from './db';

import type { ActivityKind, ActivityStatus } from './activityTypes';

export type { ActivityKind, ActivityStatus } from './activityTypes';

export type ActivityRow = {
  id: number;
  ts: string;
  tool: string;
  label: string;
  summary: string;
  kind: ActivityKind;
  status: ActivityStatus;
  user_text: string | null;
  input: string | null;
  result: string | null;
};

export type NewActivity = Omit<ActivityRow, 'id' | 'ts' | 'input' | 'result'> & { input?: unknown; result?: string };

const MAX_ROWS = 1000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 입력 JSON 을 기록용 문자열로. 비밀번호·토큰 같은 키는 가린다. */
export function redactInput(input: unknown): string {
  return JSON.stringify(input ?? {}, (k, v) => (/pass|token|secret|key/i.test(k) ? '***' : v));
}

export async function logActivity(a: NewActivity, now: Date = new Date()): Promise<void> {
  try {
    const db = await getDb();
    await db.runAsync(
      'INSERT INTO activity (ts, tool, label, summary, kind, status, user_text, input, result) VALUES (?,?,?,?,?,?,?,?,?)',
      now.toISOString(), a.tool, a.label, clip(a.summary, 300), a.kind, a.status,
      a.user_text ? clip(a.user_text, 500) : null,
      clip(redactInput(a.input), 2000),
      a.result ? clip(a.result, 1000) : null,
    );
    // 오래된 기록 정리 (너무 불어나지 않게)
    await db.runAsync('DELETE FROM activity WHERE id <= (SELECT MAX(id) FROM activity) - ?', MAX_ROWS);
  } catch {
    // 기록 실패가 비서 동작을 막으면 안 된다
  }
}

export async function listActivity(limit = 300): Promise<ActivityRow[]> {
  const db = await getDb();
  return db.getAllAsync<ActivityRow>('SELECT * FROM activity ORDER BY id DESC LIMIT ?', limit);
}

export async function clearActivity(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM activity');
}

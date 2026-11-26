import { kvGet, kvSet } from '@/core/db';
import type { History } from './agent';

export async function loadHistory(): Promise<History> {
  const raw = await kvGet('chat_history');
  if (!raw) return [];
  try {
    return JSON.parse(raw) as History;
  } catch {
    return [];
  }
}
export const saveHistory = (h: History) => kvSet('chat_history', JSON.stringify(h));

import type { AgentTool } from '@/agent/tool';
import { calendarTools } from './calendar/tools';

/** 앱에 내장된 서비스 연동 도구 (HTTP 매니페스트로 등록하는 연동 앱과는 별개). */
export async function integrationTools(): Promise<AgentTool[]> {
  return [...(await calendarTools())];
}

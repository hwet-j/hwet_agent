import type { AgentTool } from '@/agent/tool';
import { allCalendarTools, calendarTools } from './calendar/tools';
import { flowledgerTools } from './flowledger/tools';
import { launcherTools } from './launcher/tools';
import { leaselogTools } from './leaselog/tools';
import { rentSyncTools } from './rentsync/tools';
import { routinelogTools } from './routinelog/tools';

/** 앱에 내장된 서비스 연동 도구 (HTTP 매니페스트로 등록하는 연동 앱과는 별개). */
export async function integrationTools(): Promise<AgentTool[]> {
  return [...(await calendarTools()), ...leaselogTools, ...flowledgerTools, ...rentSyncTools, ...routinelogTools, ...launcherTools];
}

/** 연결 여부와 상관없는 전체 내장 도구 (이름 → 라벨·열기 버튼 등 메타데이터 조회용) */
export function allIntegrationTools(): AgentTool[] {
  return [...allCalendarTools(), ...leaselogTools, ...flowledgerTools, ...rentSyncTools, ...routinelogTools, ...launcherTools];
}

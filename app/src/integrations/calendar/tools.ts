import { Linking } from 'react-native';

import type { AgentTool } from '@/agent/tool';
import { isGoogleConnected } from '../google/auth';
import { addEvent, listEvents } from '../google/calendar';
import { buildCalendarDeepLink, type NewEvent } from './pure';

const dateTimeNote =
  '날짜는 ISO 8601. 시간대 표시가 없으면 기기 현지 시각(예: 2026-11-27T15:00). 종일은 날짜만(2026-12-01).';

const eventProps = {
  title: { type: 'string', description: '일정 제목' },
  start: { type: 'string', description: `시작. ${dateTimeNote}` },
  end: { type: 'string', description: '종료(선택). 없으면 시작 1시간 뒤. 종일 일정이면 마지막 날(포함).' },
  allDay: { type: 'boolean', description: '종일 일정 여부' },
  location: { type: 'string' },
  notes: { type: 'string', description: '메모' },
};

const calendarAppTool: AgentTool = {
  name: 'calendar_app_new_event',
  label: '캘린더 앱에서 새 일정 열기',
  description:
    '내 "캘린더" 앱을 열어 값이 채워진 새 일정 화면을 보여 준다. 자동 저장되지 않고 사용자가 저장 버튼을 눌러야 등록된다. ' +
    '구글 계정 연결 없이 빠르게 일정 초안을 만들 때 사용한다.',
  needsConfirm: false,
  inputSchema: { type: 'object', properties: eventProps, required: ['title', 'start'] },
  async run(input) {
    const url = buildCalendarDeepLink(input);
    try {
      await Linking.openURL(url);
    } catch {
      throw new Error('캘린더 앱을 열 수 없어요. 설치되어 있는지, 딥링크를 지원하는 버전인지 확인해 주세요.');
    }
    return { opened: true, note: '캘린더 앱에 일정 화면을 열었어요. 사용자가 저장을 눌러야 등록됩니다.' };
  },
};

const gcalTools: AgentTool[] = [
  {
    name: 'gcal_list_events',
    label: '구글 캘린더 조회',
    description:
      '구글 기본 캘린더의 일정을 시간순으로 조회한다(내 캘린더 앱과 동기화되는 같은 캘린더). time_min/time_max 는 ISO 8601, 최대 1년.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: {
        time_min: { type: 'string', description: '조회 시작. 예: 2026-11-27T00:00:00+09:00' },
        time_max: { type: 'string', description: '조회 끝(미포함)' },
        max_results: { type: 'integer', description: '최대 개수(1~50, 기본 25)' },
      },
      required: ['time_min', 'time_max'],
    },
    run: (input) => listEvents(input.time_min, input.time_max, input.max_results),
  },
  {
    name: 'gcal_add_event',
    label: '구글 캘린더에 일정 추가',
    description:
      '구글 기본 캘린더에 일정을 추가한다. 내 캘린더 앱에는 앱의 다음 동기화 때 나타난다. 실행 전에 사용자 확인을 받는다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: eventProps, required: ['title', 'start'] },
    run: (input) => addEvent(input as unknown as NewEvent),
  },
];

/** 구글 계정이 연결된 경우에만 구글 캘린더 도구를 노출한다. */
export async function calendarTools(): Promise<AgentTool[]> {
  return (await isGoogleConnected()) ? [calendarAppTool, ...gcalTools] : [calendarAppTool];
}

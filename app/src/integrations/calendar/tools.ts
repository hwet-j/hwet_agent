import { Linking } from 'react-native';

import type { AgentTool } from '@/agent/tool';
import { isGoogleConnected } from '../google/auth';
import { addEvent, deleteEvent, getEventLite, listEvents, updateEvent } from '../google/calendar';
import { buildCalendarDeepLink, describeEvent, normalizeChanges, type NewEvent } from './pure';

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
      '구글 기본 캘린더에 일정을 추가한다. 내 캘린더 앱에는 앱의 다음 동기화 때 나타난다. 시간 일정에는 시각이 꼭 필요하다. 실행 전에 사용자 확인을 받는다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: eventProps, required: ['title', 'start'] },
    run: (input) => addEvent(input as unknown as NewEvent),
  },
  {
    name: 'gcal_update_event',
    label: '구글 캘린더 일정 수정',
    description:
      '구글 캘린더의 기존 일정을 수정한다. event_id 는 반드시 gcal_list_events 결과의 id 를 그대로 쓴다(추측 금지). ' +
      '바꿀 항목만 넣는다. start 만 바꾸면 기존 길이를 유지한 채 통째로 옮겨진다. 장소·메모를 지우려면 빈 문자열(""). ' +
      '반복 일정은 그 회차만 바뀐다. 같은 조건의 일정이 여러 개면 어느 것인지 사용자에게 먼저 묻는다. 실행 전에 사용자 확인을 받는다.',
    needsConfirm: true,
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'string', description: 'gcal_list_events 로 얻은 일정 id' },
        title: { type: 'string', description: '새 제목' },
        start: { type: 'string', description: `새 시작. ${dateTimeNote}` },
        end: { type: 'string', description: '새 종료(선택). 종일 일정이면 마지막 날(포함)' },
        all_day: { type: 'boolean', description: '종일 일정으로 바꾸거나(true) 시간 일정으로 되돌릴 때(false)' },
        location: { type: 'string', description: '새 장소. 빈 문자열이면 지움' },
        notes: { type: 'string', description: '새 메모. 빈 문자열이면 지움' },
      },
      required: ['event_id'],
    },
    async preview(input) {
      const { event_id, ...rest } = input;
      const changes = normalizeChanges(rest);
      const now = await getEventLite(event_id);
      const parts = [`현재: ${describeEvent(now)}`, '바꿀 내용:'];
      if (changes.title !== undefined) parts.push(`• 제목 → ${changes.title}`);
      if (changes.start !== undefined) parts.push(`• 시작 → ${changes.start}`);
      if (changes.end !== undefined) parts.push(`• 종료 → ${changes.end}`);
      if (changes.allDay !== undefined) parts.push(`• ${changes.allDay ? '종일 일정으로' : '시간 일정으로'}`);
      if (changes.location !== undefined) parts.push(`• 장소 → ${changes.location || '(지움)'}`);
      if (changes.notes !== undefined) parts.push(`• 메모 → ${changes.notes ? changes.notes.slice(0, 80) : '(지움)'}`);
      return parts.join('\n');
    },
    run: (input) => {
      const { event_id, ...rest } = input;
      return updateEvent(event_id, rest);
    },
  },
  {
    name: 'gcal_delete_event',
    label: '구글 캘린더 일정 삭제',
    description:
      '구글 캘린더의 일정을 삭제한다(되돌릴 수 없음). event_id 는 반드시 gcal_list_events 결과의 id 를 그대로 쓴다(추측 금지). ' +
      '반복 일정은 그 회차만 삭제된다. 삭제할 일정이 분명하지 않거나 후보가 여럿이면 먼저 사용자에게 묻는다. 실행 전에 사용자 확인을 받는다.',
    needsConfirm: true,
    inputSchema: {
      type: 'object',
      properties: { event_id: { type: 'string', description: 'gcal_list_events 로 얻은 일정 id' } },
      required: ['event_id'],
    },
    async preview(input) {
      return `삭제할 일정:\n${describeEvent(await getEventLite(input.event_id))}\n\n삭제하면 되돌릴 수 없어요.`;
    },
    run: (input) => deleteEvent(input.event_id),
  },
];

/** 구글 계정이 연결된 경우에만 구글 캘린더 도구를 노출한다. */
export async function calendarTools(): Promise<AgentTool[]> {
  return (await isGoogleConnected()) ? [calendarAppTool, ...gcalTools] : [calendarAppTool];
}

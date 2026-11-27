import type { AgentTool } from '@/agent/tool';
import { callProvider } from '../../../modules/assistant-bridge';
import { AUTHORITY, addDays, buildAddPath, buildLogArgs, dayItems, summarizeRoutines, type RoutineQuery } from './pure';
import { Linking } from 'react-native';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const newReqId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

async function call<T = any>(method: string, arg: unknown): Promise<T> {
  const r = await callProvider(AUTHORITY, method, arg);
  if (r.error) {
    if (r.error === 'unavailable') throw new Error('RoutineLog 앱을 찾을 수 없어요. 설치했는지, 이 연동을 지원하는 최신 버전인지 확인해 주세요.');
    if (r.error === 'no_db') throw new Error('RoutineLog 앱을 한 번 실행해 주세요. (아직 데이터가 만들어지지 않았어요)');
    if (r.error === 'already_done') throw new Error(r.message || '이미 체크한 시간이에요');
    if (r.error === 'forbidden') throw new Error('RoutineLog 가 이 앱의 접근을 거부했어요.');
    throw new Error(r.message ? `${r.message}` : `RoutineLog 오류: ${r.error}`);
  }
  try {
    return JSON.parse(r.json ?? '') as T;
  } catch {
    throw new Error('RoutineLog 응답을 해석할 수 없어요.');
  }
}

const readQuery = (days: number) => {
  const to = ymd(new Date());
  return call<RoutineQuery>('query', { from: addDays(to, -days), to });
};

export const routinelogTools: AgentTool[] = [
  {
    name: 'routinelog_today',
    label: 'RoutineLog 오늘 할 일 조회',
    readOnly: true,
    description:
      '루틴 앱 RoutineLog 에서 오늘(또는 date) 먹어야 할 약·영양제와 해야 할 습관, 각각 완료/놓침/남음 상태를 읽는다(앱을 열지 않음). ' +
      '"오늘 약 먹었나?", "아직 안 한 거 뭐야?", "오늘 루틴 알려줘" 같은 질문에 쓴다. 결과의 status: done 완료, pending 아직, overdue 시각이 지났는데 미체크, skipped 건너뜀.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD, 생략하면 오늘' } } },
    describe: (i) => `RoutineLog 오늘 할 일 조회${i.date ? ` (${i.date})` : ''}`,
    openLink: () => ({ app: 'routinelog', label: 'RoutineLog에서 오늘 보기', path: 'today' }),
    async run(input) {
      const q = await readQuery(14);
      const now = new Date();
      const date = typeof input.date === 'string' ? input.date : q.today;
      const items = dayItems(q, date, { today: q.today, hm: hm(now) });
      const left = items.filter((x) => x.status === 'pending' || x.status === 'overdue');
      return { source: 'RoutineLog', date, now: hm(now), summary: { total: items.length, done: items.filter((x) => x.status === 'done').length, left: left.length }, items };
    },
  },
  {
    name: 'routinelog_stats',
    label: 'RoutineLog 습관·복약 통계',
    readOnly: true,
    description:
      '루틴별 현재 연속 일수·최장 연속·달성률(복약 순응도)·건너뛴 횟수·이번 주 진행(주 N회)·기록한 값 합계(러닝 km 등)와 최근 메모를 읽어 계산한다. ' +
      '"운동 며칠 연속이야?", "영양제 얼마나 잘 챙겼어?", "이번 달 습관 어땠어" 같은 질문에 쓴다. days 는 기간(기본 30, 최대 90).',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { days: { type: 'integer', description: '최근 N일 (기본 30)' } } },
    describe: (i) => `RoutineLog 통계: 최근 ${i.days ?? 30}일`,
    openLink: () => ({ app: 'routinelog', label: 'RoutineLog에서 통계 보기', path: 'stats' }),
    async run(input) {
      const days = Math.min(Math.max(Number(input.days) || 30, 1), 90);
      const q = await readQuery(Math.max(days, 14));
      return { source: 'RoutineLog', days, today: q.today, routines: summarizeRoutines(q, days), ...(q.truncated ? { note: '기록이 많아 일부만 읽었어요' } : {}) };
    },
  },
  {
    name: 'routinelog_log',
    label: 'RoutineLog 체크·기록',
    description:
      '루틴 앱 RoutineLog 에 "했어요"를 기록한다(앱을 열지 않고 바로 저장). 복약·영양제는 slot(HH:MM 또는 아침/점심/저녁 같은 라벨)을 말했으면 그 시간으로, 말하지 않으면 앱이 아직 안 먹은 가장 가까운 시간으로 체크한다. ' +
      '습관은 count(횟수, 물 3잔이면 3)와 value·note 로 "무엇을 했는지"를 함께 남긴다(예: 러닝 value=5 note="한강 5km", 영어 note="쉐도잉 30분, 단어 20개"). ' +
      'status 는 기본 done, 일부러 건너뛰었으면 skipped. 날짜를 말하지 않으면 오늘. 루틴 이름이 불확실하면 먼저 routinelog_today 로 목록을 확인한다. 결과의 id 로 방금 기록을 취소할 수 있다(routinelog_undo).',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: {
        routine: { type: 'string', description: '루틴 이름 (예: 비타민D, 오메가3, 운동, 영어 공부)' },
        date: { type: 'string', description: 'YYYY-MM-DD, 생략하면 오늘' },
        slot: { type: 'string', description: '복용 시각 HH:MM 또는 라벨(아침/점심/저녁/취침 전)' },
        status: { type: 'string', enum: ['done', 'skipped'] },
        count: { type: 'integer', description: '습관 횟수(기본 1)' },
        value: { type: 'number', description: '습관 수치(예: 5 → 5km)' },
        note: { type: 'string', description: '무엇을 했는지 메모' },
      },
      required: ['routine'],
    },
    describe: (i) => `${i.status === 'skipped' ? '건너뜀' : '체크'}: ${i.routine}${i.slot ? ` ${i.slot}` : ''}${i.note ? ` · ${i.note}` : ''}`,
    openLink: () => ({ app: 'routinelog', label: 'RoutineLog에서 오늘 보기', path: 'today' }),
    async run(input) {
      return { source: 'RoutineLog', ...(await call('log', buildLogArgs(input, newReqId()))) };
    },
  },
  {
    name: 'routinelog_undo',
    label: 'RoutineLog 기록 취소',
    description: '방금 한 체크/기록을 취소(삭제)한다. id 는 routinelog_log 결과의 log id. 사용자가 "방금 거 취소"라고 할 때만 쓴다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    describe: () => 'RoutineLog 기록 취소',
    async run(input) {
      return { source: 'RoutineLog', ...(await call('undo', { id: String(input.id) })) };
    },
  },
  {
    name: 'routinelog_add_routine',
    label: 'RoutineLog 새 루틴 화면 열기',
    handoff: true,
    description:
      'RoutineLog 의 "새 루틴" 화면을 값이 채워진 채로 연다. 저장(알림 예약 포함)은 사용자가 앱에서 눌러야 한다. 이름만 필수. ' +
      'kind: medication(처방약)/supplement(영양제)/habit(습관). times: ["08:00","21:00"]. days: 월~일 7자리(평일만 1111100, 매일은 생략). ' +
      '사용자가 시간·요일을 말하지 않았으면 추측하지 말고 먼저 물어본다.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }, kind: { type: 'string', enum: ['medication', 'supplement', 'habit'] },
        times: { type: 'array', items: { type: 'string' }, description: '알림/복용 시각 HH:MM 목록' },
        days: { type: 'string', description: '월~일 7자리 0/1' }, detail: { type: 'string', description: '복용량/메모' },
      },
      required: ['name'],
    },
    describe: (i) => `새 루틴 화면 열기: ${i.name}${Array.isArray(i.times) ? ` (${i.times.join(', ')})` : ''}`,
    async run(input) {
      const url = `routinelog://${buildAddPath(input)}`;
      try {
        await Linking.openURL(url);
      } catch {
        throw new Error('RoutineLog 앱을 열 수 없어요. 설치되어 있는지 확인해 주세요.');
      }
      return { opened: true, note: 'RoutineLog 에 새 루틴 화면을 열었어요. 사용자가 저장해야 알림이 예약돼요.' };
    },
  },
];


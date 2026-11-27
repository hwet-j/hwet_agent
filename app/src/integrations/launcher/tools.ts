import { Linking } from 'react-native';

import type { AgentTool } from '@/agent/tool';
import { LauncherNative, type InstalledApp } from '../../../modules/launcher';
import {
  alarmArgs, dialNumber, geoUrl, parseDestination, pickMusicApp, pickNavTargets, resolveApp, safeHttpsUrl, timerSeconds, volumeArgs, youtubeSearchUrl,
} from './pure';

const native = () => {
  if (!LauncherNative) throw new Error('이 기기에서는 앱 실행 기능을 쓸 수 없어요');
  return LauncherNative;
};
const apps = (): InstalledApp[] => native().listApps();

export const launcherTools: AgentTool[] = [
  {
    name: 'launcher_open_app',
    label: '앱 실행',
    describe: (i) => `앱 실행: ${i.name}`,
    description:
      '휴대폰에 설치된 앱을 이름으로 찾아 실행한다("유튜브 열어줘", "카톡 켜줘", "카메라"). 앱 안의 데이터는 읽거나 바꾸지 않고 앱만 연다. 비슷한 이름이 여럿이면 후보를 돌려주니 사용자에게 어느 앱인지 물어본다. 설치된 앱 목록 자체는 알려 주지 않는다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: '앱 이름(사용자가 말한 그대로)' } }, required: ['name'] },
    async run(input) {
      if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('앱 이름이 필요해요');
      const r = resolveApp(apps(), input.name);
      if ('none' in r) return { opened: false, note: `"${input.name}" 와 비슷한 설치된 앱을 찾지 못했어요.` };
      if ('candidates' in r) return { opened: false, candidates: r.candidates.map((a) => a.label), note: '비슷한 앱이 여러 개예요. 사용자에게 어느 것인지 물어보세요.' };
      return native().launchApp(r.app.package) ? { opened: true, app: r.app.label } : { opened: false, note: `${r.app.label} 을(를) 열지 못했어요.` };
    },
  },
  {
    name: 'launcher_play_music',
    label: '음악 재생',
    describe: (i) => `음악 재생: ${i.query}${i.app ? ` (${i.app})` : ''}`,
    description:
      '음악 앱에서 곡·가수·재생목록을 검색해 재생한다("아이유 노래 틀어줘", "잔잔한 피아노 음악"). app 을 말하면 그 앱(유튜브 뮤직·스포티파이·멜론·지니·FLO·VIBE 등)으로, 말하지 않으면 설치된 음악 앱 중 우선순위가 높은 것으로 한다. 음악 앱이 없으면 유튜브 검색을 연다.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '곡/가수/장르/분위기 검색어' }, app: { type: 'string', description: '쓸 음악 앱 이름(선택)' } },
      required: ['query'],
    },
    async run(input) {
      if (typeof input.query !== 'string' || !input.query.trim()) throw new Error('검색어가 필요해요');
      const q = input.query.trim().slice(0, 120);
      const list = apps();
      const app = pickMusicApp(list, typeof input.app === 'string' ? input.app : undefined);
      if (native().playMusic(q, app?.package ?? null)) return { started: true, app: app?.label ?? '기기 기본 음악 앱', query: q, note: '앱이 검색 결과를 재생하는지는 앱에 따라 달라요. 첫 곡이 자동으로 나오지 않으면 앱 화면에서 골라야 할 수 있어요.' };
      await Linking.openURL(youtubeSearchUrl(q));
      return { started: true, app: '유튜브(검색 결과)', query: q, note: '음악 앱을 찾지 못해 유튜브 검색을 열었어요. 화면에서 곡을 골라야 해요.' };
    },
  },
  {
    name: 'launcher_media_control',
    label: '미디어 제어',
    describe: (i) => `미디어 제어: ${i.action}`,
    description: '지금 재생 중인 음악·영상을 제어한다: play_pause(재생/일시정지 토글), play, pause, next(다음 곡), previous(이전 곡), stop. "다음 곡", "멈춰", "일시정지".',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['play_pause', 'play', 'pause', 'next', 'previous', 'stop'] } }, required: ['action'] },
    async run(input) {
      const ok = native().mediaKey(String(input.action));
      return ok ? { sent: true, action: input.action, note: '재생 중인 앱이 없으면 아무 일도 일어나지 않아요.' } : { sent: false };
    },
  },
  {
    name: 'launcher_set_volume',
    label: '음량 조절',
    describe: (i) => `음량: ${i.percent ?? i.direction}`,
    description: '미디어 음량을 바꾼다. percent(0~100)로 정확히, 또는 direction(up/down)으로 10%씩. "소리 줄여줘", "볼륨 50%".',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { percent: { type: 'integer' }, direction: { type: 'string', enum: ['up', 'down'] } } },
    async run(input) {
      const n = native();
      const target = volumeArgs(input, n.getVolume());
      return { volumePercent: n.setVolume(target) };
    },
  },
  {
    name: 'launcher_navigate',
    label: '길 안내',
    describe: (i) => `길 안내: ${i.destination}`,
    description:
      '지도·내비 앱(티맵, 카카오맵, 네이버 지도, 구글 지도 중 설치된 것)에서 목적지를 검색해 연다("서울역 가는 길", "집 근처 주유소"). 앱은 설치된 것 중 티맵→카카오맵→네이버→구글 순으로 고르고, app 을 말하면 그 앱으로 한다. ' +
      '목적지 검색 화면까지 열어 주며, 경로 안내 시작은 앱 화면에서 사용자가 누른다(좌표 없이는 앱이 자동 시작을 허용하지 않는 경우가 많다). 목적지가 모호하면 먼저 물어본다.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: { destination: { type: 'string', description: '목적지 이름이나 주소' }, app: { type: 'string', description: '쓸 지도 앱(선택)' } },
      required: ['destination'],
    },
    async run(input) {
      const dest = parseDestination(input.destination);
      const targets = pickNavTargets(apps(), typeof input.app === 'string' ? input.app : undefined);
      for (const t of targets) {
        try {
          await Linking.openURL(t.url(dest));
          return { opened: true, app: t.name, destination: dest, note: `${t.name} 에서 "${dest}" 검색 결과를 열었어요. 경로 안내 시작은 앱에서 눌러야 해요.` };
        } catch {
          /* 다음 앱 */
        }
      }
      try {
        await Linking.openURL(geoUrl(dest));
        return { opened: true, app: '지도 앱(기기 선택)', destination: dest };
      } catch {
        return { opened: false, note: '지도·내비 앱을 열지 못했어요. 설치되어 있는지 확인해 주세요.' };
      }
    },
  },
  {
    name: 'launcher_set_timer',
    label: '타이머 설정',
    describe: (i) => `타이머: ${i.hours ? `${i.hours}시간 ` : ''}${i.minutes ? `${i.minutes}분 ` : ''}${i.seconds ? `${i.seconds}초` : ''}`.trim(),
    description: '시계 앱에 타이머를 바로 설정한다("10분 타이머", "라면 3분"). 시간은 hours/minutes/seconds 를 합산한다(최대 24시간). label 은 선택.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { hours: { type: 'number' }, minutes: { type: 'number' }, seconds: { type: 'number' }, label: { type: 'string' } } },
    async run(input) {
      const s = timerSeconds(input);
      const label = typeof input.label === 'string' && input.label.trim() ? input.label.trim().slice(0, 60) : null;
      return native().setTimer(s, label) ? { set: true, seconds: s, label } : { set: false, note: '시계 앱이 타이머 설정 요청을 받지 못했어요.' };
    },
  },
  {
    name: 'launcher_set_alarm',
    label: '알람 설정',
    describe: (i) => `알람: ${i.time}${Array.isArray(i.days) ? ` (${i.days.join(',')})` : ''}`,
    description: '시계 앱에 알람을 설정한다("내일 7시에 깨워줘"). time 은 24시간 HH:MM, 반복은 days(mon~sun 배열), 생략하면 한 번만. 날짜가 필요한 알람은 지원하지 않으니 "내일"이면 시각만 설정한다고 알려 준다. 앱 자체 할 일 알림이 필요하면 set_reminder 를 쓴다.',
    needsConfirm: false,
    inputSchema: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'HH:MM 24시간' },
        days: { type: 'array', items: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] } },
        label: { type: 'string' },
      },
      required: ['time'],
    },
    async run(input) {
      const a = alarmArgs(input);
      return native().setAlarm(a.hour, a.minute, a.label, a.days) ? { set: true, time: input.time, days: a.days ? input.days : '한 번만' } : { set: false, note: '시계 앱이 알람 설정 요청을 받지 못했어요.' };
    },
  },
  {
    name: 'launcher_dial',
    label: '전화 걸기 화면',
    describe: (i) => `전화 화면 열기: ${i.name ?? i.number}`,
    description: '전화 앱의 다이얼 화면에 번호를 채워 연다(자동으로 걸지는 않고, 사용자가 통화 버튼을 눌러야 한다). 번호는 사용자가 직접 말한 것만 쓴다. 비서는 연락처를 읽을 수 없으니 이름만 말하면 번호를 물어본다.',
    needsConfirm: false,
    inputSchema: { type: 'object', properties: { number: { type: 'string' }, name: { type: 'string', description: '표시용 이름(선택)' } }, required: ['number'] },
    async run(input) {
      const n = dialNumber(input.number);
      await Linking.openURL(`tel:${n}`);
      return { opened: true, note: '전화 앱에 번호를 채웠어요. 통화 버튼은 사용자가 눌러야 해요.' };
    },
  },
  {
    name: 'launcher_open_url',
    label: '웹 주소 열기',
    describe: (i) => `웹 주소 열기: ${String(i.url).slice(0, 60)}`,
    description: 'https 웹 주소를 브라우저로 연다. 외부 사이트를 여는 것이므로 항상 사용자 확인을 받는다.',
    needsConfirm: true,
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async preview(input) {
      return `이 주소를 브라우저로 열어요:\n${safeHttpsUrl(input.url)}`;
    },
    async run(input) {
      await Linking.openURL(safeHttpsUrl(input.url));
      return { opened: true };
    },
  },
];

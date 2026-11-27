import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  alarmArgs, dialNumber, matchApps, normalizeName, parseDestination, pickMusicApp, pickNavTargets, resolveApp, safeHttpsUrl, timerSeconds, volumeArgs,
  type App,
} from '../src/integrations/launcher/pure.ts';

const apps: App[] = [
  { label: 'YouTube', package: 'com.google.android.youtube' },
  { label: 'YouTube Music', package: 'com.google.android.apps.youtube.music' },
  { label: '카카오톡', package: 'com.kakao.talk' },
  { label: '카카오맵', package: 'net.daum.android.map' },
  { label: 'T map', package: 'com.skt.tmap.ku' },
  { label: '네이버 지도', package: 'com.nhn.android.nmap' },
  { label: '멜론', package: 'com.iloen.melon' },
  { label: '카메라', package: 'com.sec.android.app.camera' },
  { label: 'Chrome', package: 'com.android.chrome' },
];

test('이름 정규화', () => assert.equal(normalizeName(' You-Tube Music '), 'youtubemusic'));

test('앱 찾기: 정확 일치, 별칭, 모호함, 없음', () => {
  assert.deepEqual(resolveApp(apps, '카카오톡'), { app: apps[2] });
  assert.deepEqual(resolveApp(apps, '카톡'), { app: apps[2] });
  assert.deepEqual(resolveApp(apps, '크롬'), { app: apps[8] });
  assert.deepEqual(resolveApp(apps, '멜론'), { app: apps[6] });
  assert.deepEqual(resolveApp(apps, '유튜브 뮤직'), { app: apps[1] });
  const yt = resolveApp(apps, '유튜브');
  assert.deepEqual(yt, { app: apps[0] }, 'YouTube 가 YouTube Music 보다 우선');
  const kk = resolveApp(apps, '카카오');
  assert.ok('candidates' in kk || 'app' in kk);
  assert.deepEqual(resolveApp(apps, '없는앱이름'), { none: true });
  assert.deepEqual(resolveApp(apps, ''), { none: true });
});

test('앱 찾기: 점수 순서와 개수 제한', () => {
  const m = matchApps(apps, '카카오', 2);
  assert.equal(m.length, 2);
  assert.ok(m[0].score >= m[1].score);
});

test('음악 앱 선택: 우선순위, 지정, 없음', () => {
  assert.equal(pickMusicApp(apps)?.package, 'com.google.android.apps.youtube.music');
  assert.equal(pickMusicApp(apps, '멜론')?.package, 'com.iloen.melon');
  assert.equal(pickMusicApp([apps[7]]), null);
  assert.equal(pickMusicApp(apps, '없는앱'), null);
});

test('지도 앱 선택: 설치된 것만, 우선순위, 지정', () => {
  assert.deepEqual(pickNavTargets(apps).map((t) => t.id), ['tmap', 'kakaomap', 'naver']);
  assert.deepEqual(pickNavTargets(apps, '카카오맵').map((t) => t.id), ['kakaomap']);
  assert.deepEqual(pickNavTargets(apps, '네이버').map((t) => t.id), ['naver']);
  assert.deepEqual(pickNavTargets(apps, '구글').map((t) => t.id), ['tmap', 'kakaomap', 'naver'], '없는 앱을 지정하면 설치된 것으로');
  assert.deepEqual(pickNavTargets([], undefined), []);
  assert.equal(pickNavTargets(apps)[0].url('서울역 1번 출구'), 'tmap://search?name=%EC%84%9C%EC%9A%B8%EC%97%AD%201%EB%B2%88%20%EC%B6%9C%EA%B5%AC');
});

test('목적지 검증', () => {
  assert.equal(parseDestination(' 서울역 '), '서울역');
  assert.throws(() => parseDestination(''));
  assert.throws(() => parseDestination('가'.repeat(121)));
});

test('타이머: 합산, 범위', () => {
  assert.equal(timerSeconds({ minutes: 10 }), 600);
  assert.equal(timerSeconds({ hours: 1, minutes: 30, seconds: 15 }), 5415);
  assert.throws(() => timerSeconds({}));
  assert.throws(() => timerSeconds({ hours: 25 }));
  assert.throws(() => timerSeconds({ minutes: -1 }));
  assert.throws(() => timerSeconds({ minutes: '5' }));
});

test('알람: 시각, 요일(일=1…토=7), 라벨', () => {
  assert.deepEqual(alarmArgs({ time: '7:05' }), { hour: 7, minute: 5, days: null, label: null });
  assert.deepEqual(alarmArgs({ time: '06:30', days: ['mon', 'fri', 'mon'], label: ' 출근 ' }), { hour: 6, minute: 30, days: [2, 6], label: '출근' });
  assert.deepEqual(alarmArgs({ time: '08:00', days: ['sun', 'sat'] }).days, [1, 7]);
  assert.throws(() => alarmArgs({ time: '24:00' }));
  assert.throws(() => alarmArgs({ time: '7시' }));
  assert.throws(() => alarmArgs({ time: '07:00', days: ['someday'] }));
});

test('음량', () => {
  assert.equal(volumeArgs({ percent: 40 }, 10), 40);
  assert.equal(volumeArgs({ direction: 'up' }, 95), 100);
  assert.equal(volumeArgs({ direction: 'down' }, 5), 0);
  assert.throws(() => volumeArgs({ percent: 101 }, 0));
  assert.throws(() => volumeArgs({}, 0));
});

test('웹 주소: https 만, 계정 정보 금지', () => {
  assert.equal(safeHttpsUrl(' https://example.com/a?b=1 '), 'https://example.com/a?b=1');
  assert.throws(() => safeHttpsUrl('http://example.com'));
  assert.throws(() => safeHttpsUrl('javascript:alert(1)'));
  assert.throws(() => safeHttpsUrl('https://user:pw@evil.com/'));
  assert.throws(() => safeHttpsUrl('https://a.com/ b'));
});

test('전화번호', () => {
  assert.equal(dialNumber('010-1234-5678'), '01012345678');
  assert.equal(dialNumber('+82 10 1234 5678'), '+821012345678');
  assert.throws(() => dialNumber('abc'));
  assert.throws(() => dialNumber('12'));
});

import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { saveHistory } from '@/agent/chatStore';
import { Button, Field, Section } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { applyBriefing } from '@/core/briefing';
import { kvSet } from '@/core/db';
import { getAutoRecord } from '@/integrations/flowledger/tools';
import { getVoiceSettings, setVoiceSetting, type VoiceSettings } from '@/voice/settings';
import { GOOGLE_CLIENT_ID, clearGoogle, getGoogleEmail, isGoogleConnected } from '@/integrations/google/auth';
import { useGoogleLogin } from '@/integrations/google/useGoogleLogin';
import {
  DEFAULT_MODEL,
  clearApiKey,
  getApiKey,
  getBriefing,
  getModel,
  setApiKey,
  setBriefing,
  setModel,
} from '@/core/settings';

const clamp = (v: string, max: number) => Math.min(max, Math.max(0, parseInt(v, 10) || 0));

export default function SettingsScreen() {
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState('');
  const [model, setModelText] = useState(DEFAULT_MODEL);
  const [brEnabled, setBrEnabled] = useState(false);
  const [hour, setHour] = useState('8');
  const [minute, setMinute] = useState('0');
  const [gConnected, setGConnected] = useState(false);
  const [gEmail, setGEmail] = useState<string | null>(null);
  const [autoRecord, setAutoRecord] = useState(false);
  const [voice, setVoice] = useState<VoiceSettings>({ tts: true, relisten: false, openListen: false });
  const googleLogin = useGoogleLogin();

  useEffect(() => {
    getAutoRecord().then(setAutoRecord);
    getVoiceSettings().then(setVoice);
  }, []);

  useEffect(() => {
    (async () => {
      setHasKey(!!(await getApiKey()));
      setModelText(await getModel());
      const b = await getBriefing();
      setBrEnabled(b.enabled);
      setHour(String(b.hour));
      setMinute(String(b.minute));
      setGConnected(await isGoogleConnected());
      setGEmail(await getGoogleEmail());
    })();
  }, []);

  const saveKey = async () => {
    if (!key.trim()) return;
    await setApiKey(key);
    setKey('');
    setHasKey(true);
    Alert.alert('저장됨', 'API 키를 기기 보안 저장소에 저장했어요.');
  };

  const connectGoogle = async () => {
    try {
      const r = await googleLogin();
      if (r) {
        setGConnected(true);
        setGEmail(r.email ?? null);
      }
    } catch (e) {
      Alert.alert('구글 연결 실패', e instanceof Error ? e.message : String(e));
    }
  };

  const saveBriefing = async (enabled: boolean) => {
    const b = { enabled, hour: clamp(hour, 23), minute: clamp(minute, 59) };
    const r = await applyBriefing(b);
    if (!r.ok) {
      setBrEnabled(false);
      await setBriefing({ ...b, enabled: false });
      Alert.alert('브리핑을 켤 수 없어요', r.reason);
      return;
    }
    setBrEnabled(enabled);
    setHour(String(b.hour));
    setMinute(String(b.minute));
    await setBriefing(b);
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle" style={styles.title}>설정</ThemedText>

          <Section title="Claude API 키" hint={`${hasKey ? '저장되어 있어요. 새 키를 입력하면 교체됩니다.' : '아직 없어요.'} 키는 이 기기의 보안 저장소에만 보관됩니다.`}>
            <Field placeholder="sk-ant-…" value={key} onChangeText={setKey} secureTextEntry />
            <Button title="키 저장" disabled={!key.trim()} onPress={saveKey} />
            {hasKey && (
              <Button
                title="키 삭제"
                kind="danger"
                onPress={async () => {
                  await clearApiKey();
                  setHasKey(false);
                }}
              />
            )}
            <ThemedText type="smallBold">모델</ThemedText>
            <Field value={model} onChangeText={setModelText} onEndEditing={() => setModel(model)} />
          </Section>

          <Section
            title="연동 앱 정보 읽기"
            hint={`'이번 달 미납', '이번 주 일정'처럼 물으면 LeaseLog·캘린더 앱의 정보를 읽어 와요. 읽은 내용은 답변을 만들기 위해 Claude(Anthropic)로 전송돼요. LeaseLog 는 전화번호·주민번호·계좌·메모를 보내지 않고, 캘린더 앱은 일정 메모·참석자를 보내지 않아요. 읽기만 하며 데이터를 바꾸지 않아요. (LeaseLog 1.7.0 이상 필요)`}
          >
            <ThemedText type="small" themeColor="textSecondary">
              비서가 한 일은 「기록」 탭에서 확인할 수 있어요.
            </ThemedText>
          </Section>

          <Section
            title="구글 캘린더 (선택)"
            hint={
              gConnected
                ? `연결됨${gEmail ? ` · ${gEmail}` : ''}. 비서가 일정을 조회하고, 확인 후 추가·수정·삭제할 수 있어요.`
                : GOOGLE_CLIENT_ID
                  ? '연결하면 비서가 내 구글 캘린더(캘린더 앱과 동기화되는 캘린더)를 조회·수정할 수 있어요.'
                  : '구글 클라이언트 ID가 설정되지 않았어요. docs/google-calendar-setup.md 를 참고하세요.'
            }
          >
            {gConnected ? (
              <Button
                title="연결 해제"
                kind="soft"
                onPress={async () => {
                  await clearGoogle();
                  setGConnected(false);
                  setGEmail(null);
                }}
              />
            ) : (
              <Button title="구글 계정 연결" disabled={!GOOGLE_CLIENT_ID} onPress={connectGoogle} />
            )}
          </Section>

          <Section
            title="가계부 (FlowLedger)"
            hint="가계부 기록·수정은 기본적으로 저장 전에 한 번 확인을 받아요. 켜면 확인 없이 바로 저장하고, 잘못 기록해도 '방금 거 취소해줘'로 되돌릴 수 있어요. 삭제는 항상 확인해요."
          >
            <View style={styles.row}>
              <ThemedText style={styles.flex}>확인 없이 바로 저장</ThemedText>
              <Switch
                value={autoRecord}
                onValueChange={async (v) => {
                  setAutoRecord(v);
                  await kvSet('flowledger_auto', v ? '1' : '0');
                }}
              />
            </View>
          </Section>

          <Section
            title="음성 호출"
            hint={`채팅의 마이크 버튼, 빠른 설정 타일, 기본 어시스턴트 호출로 말하면 비서가 듣고 답해요. 음성 인식은 기기의 구글 음성 서비스를 써서 API 비용이 들지 않아요.`}
          >
            {([
              ['tts', '답변을 음성으로 읽어 주기'],
              ['relisten', '답변 후 이어서 듣기 (대화 모드)'],
              ['openListen', '앱을 열면 바로 듣기'],
            ] as const).map(([key, label]) => (
              <View key={key} style={styles.row}>
                <ThemedText style={styles.flex}>{label}</ThemedText>
                <Switch
                  value={voice[key]}
                  onValueChange={async (v) => {
                    setVoice((cur) => ({ ...cur, [key]: v }));
                    await setVoiceSetting(key, v);
                  }}
                />
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              {`• 홈/전원 버튼을 길게 눌러 부르기: 휴대폰 설정 → 앱 → 기본 앱 선택 → 디지털 어시스턴트 앱에서 "hwet-assistant"를 고르세요 (기종마다 메뉴 이름이 조금 달라요).\n• 알림창을 내려 편집(연필) → "비서에게 말하기" 타일을 끌어 넣으면 한 번에 들어요.\n• 빅스비·구글 어시스턴트로 "비서 열어줘"라고 하면 앱이 열리는데, 위의 "앱을 열면 바로 듣기"를 켜 두면 바로 듣기 시작해요.`}
            </ThemedText>
          </Section>

          <Section title="아침 브리핑 (선택)" hint="켜면 매일 정한 시각에 알림이 오고, 알림을 누르면 비서가 오늘 할 일과 메모를 정리해 줘요.">
            <View style={styles.row}>
              <ThemedText style={styles.flex}>브리핑 알림 받기</ThemedText>
              <Switch value={brEnabled} onValueChange={saveBriefing} />
            </View>
            <View style={styles.row}>
              <Field style={styles.time} value={hour} onChangeText={setHour} keyboardType="number-pad" maxLength={2} />
              <ThemedText>시</ThemedText>
              <Field style={styles.time} value={minute} onChangeText={setMinute} keyboardType="number-pad" maxLength={2} />
              <ThemedText>분</ThemedText>
              <View style={styles.flex} />
              {brEnabled && <Button title="시각 적용" kind="soft" onPress={() => saveBriefing(true)} />}
            </View>
          </Section>

          <Section title="대화">
            <Button
              title="대화 기록 지우기"
              kind="danger"
              onPress={() =>
                Alert.alert('대화 기록을 지울까요?', '할 일·메모와 활동 기록 탭의 기록은 지워지지 않아요.', [
                  { text: '취소', style: 'cancel' },
                  { text: '지우기', style: 'destructive', onPress: () => saveHistory([]) },
                ])
              }
            />
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { fontSize: 28, lineHeight: 36 },
  body: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  time: { width: 64, textAlign: 'center' },
});

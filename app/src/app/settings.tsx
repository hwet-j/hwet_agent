import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { saveHistory } from '@/agent/chatStore';
import { Button, Field } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { applyBriefing } from '@/core/briefing';
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
  const googleLogin = useGoogleLogin();

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
          <ThemedText type="subtitle">설정</ThemedText>

          <ThemedText type="smallBold">Claude API 키</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {hasKey ? '저장되어 있어요. 새 키를 입력하면 교체됩니다.' : '아직 없어요.'} 키는 이 기기의 보안
            저장소에만 보관됩니다.
          </ThemedText>
          <Field placeholder="sk-ant-…" value={key} onChangeText={setKey} secureTextEntry />
          <Button title="키 저장" disabled={!key.trim()} onPress={saveKey} />
          {hasKey && (
            <Button
              title="키 삭제"
              onPress={async () => {
                await clearApiKey();
                setHasKey(false);
              }}
            />
          )}

          <ThemedText type="smallBold">모델</ThemedText>
          <Field value={model} onChangeText={setModelText} onEndEditing={() => setModel(model)} />

          <ThemedText type="smallBold">구글 캘린더 (선택)</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {gConnected
              ? `연결됨${gEmail ? ` · ${gEmail}` : ''}. 비서가 일정을 조회하고, 확인 후 추가할 수 있어요.`
              : GOOGLE_CLIENT_ID
                ? '연결하면 비서가 내 구글 캘린더(캘린더 앱과 동기화되는 캘린더)를 조회·추가할 수 있어요.'
                : '구글 클라이언트 ID가 설정되지 않았어요. docs/google-calendar-setup.md 를 참고하세요.'}
          </ThemedText>
          {gConnected ? (
            <Button
              title="연결 해제"
              onPress={async () => {
                await clearGoogle();
                setGConnected(false);
                setGEmail(null);
              }}
            />
          ) : (
            <Button title="구글 계정 연결" disabled={!GOOGLE_CLIENT_ID} onPress={connectGoogle} />
          )}

          <ThemedText type="smallBold">아침 브리핑 (선택)</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            켜면 매일 정한 시각에 알림이 오고, 알림을 누르면 비서가 오늘 할 일과 메모를 정리해 줘요.
          </ThemedText>
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
            {brEnabled && <Button title="시각 적용" onPress={() => saveBriefing(true)} />}
          </View>

          <ThemedText type="smallBold">대화</ThemedText>
          <Button
            title="대화 기록 지우기"
            onPress={() =>
              Alert.alert('대화 기록을 지울까요?', '할 일과 메모는 지워지지 않아요.', [
                { text: '취소', style: 'cancel' },
                { text: '지우기', style: 'destructive', onPress: () => saveHistory([]) },
              ])
            }
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  time: { width: 64, textAlign: 'center' },
});

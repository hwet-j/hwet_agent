import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchManifest,
  listConnectors,
  removeConnector,
  saveConnector,
  setConnectorEnabled,
  type StoredConnector,
} from '@/connectors/registry';
import { Button, Field } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function ConnectorsScreen() {
  const [items, setItems] = useState<StoredConnector[]>([]);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setItems(await listConnectors()), []);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const add = async () => {
    setBusy(true);
    try {
      const manifest = await fetchManifest(url.trim(), token.trim() || undefined);
      const summary = manifest.tools
        .map((t) => `• ${t.name}${t.readOnly ? ' (조회)' : ' (실행 전 확인)'}`)
        .join('\n');
      Alert.alert(`"${manifest.name}" 연결할까요?`, `이 앱이 비서에게 제공하는 기능:\n${summary}`, [
        { text: '취소', style: 'cancel' },
        {
          text: '연결',
          onPress: async () => {
            await saveConnector(manifest, token.trim() || undefined);
            setUrl('');
            setToken('');
            refresh();
          },
        },
      ]);
    } catch (e) {
      Alert.alert('연결 실패', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">연동 앱</ThemedText>
          <ThemedText themeColor="textSecondary" type="small">
            내가 만든 앱이 공개한 매니페스트(https)를 등록하면, 비서가 그 앱의 기능을 도구로 사용합니다.
            데이터를 바꾸는 기능은 실행 전에 항상 확인을 받습니다.
          </ThemedText>

          {items.length === 0 && <ThemedText themeColor="textSecondary">등록된 앱이 없어요.</ThemedText>}
          {items.map(({ manifest, enabled }) => (
            <ThemedView key={manifest.id} type="backgroundElement" style={styles.card}>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{manifest.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {manifest.tools.length}개 기능 · {manifest.transport.baseUrl}
                  </ThemedText>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={async (v) => {
                    await setConnectorEnabled(manifest.id, v);
                    refresh();
                  }}
                />
              </View>
              <Button
                title="삭제"
                onPress={() =>
                  Alert.alert(`"${manifest.name}" 연결을 삭제할까요?`, undefined, [
                    { text: '취소', style: 'cancel' },
                    {
                      text: '삭제',
                      style: 'destructive',
                      onPress: async () => {
                        await removeConnector(manifest.id);
                        refresh();
                      },
                    },
                  ])
                }
              />
            </ThemedView>
          ))}

          <ThemedText type="smallBold">새 앱 등록</ThemedText>
          <Field placeholder="매니페스트 URL (https://…)" value={url} onChangeText={setUrl} keyboardType="url" />
          <Field
            placeholder="접근 토큰 (선택)"
            value={token}
            onChangeText={setToken}
            secureTextEntry
          />
          <Button title={busy ? '확인 중…' : '불러오기'} disabled={busy || !url.trim()} onPress={add} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: 16, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});

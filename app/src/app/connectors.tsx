import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchManifest, listConnectors, removeConnector, saveConnector, setConnectorEnabled, type StoredConnector } from '@/connectors/registry';
import { CATALOG, type CatalogApp } from '@/integrations/catalog';
import { probeApp, probeGoogle } from '@/integrations/status';
import { ago, STATE_LABEL, statusFromError, type AppStatus } from '@/integrations/statusPure';

type Statuses = Partial<Record<CatalogApp['id'], AppStatus | 'loading'>>;

export default function AppsScreen() {
  const [status, setStatus] = useState<Statuses>({});
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<StoredConnector[]>([]);
  const [advanced, setAdvanced] = useState(false);

  const check = useCallback(async (id?: CatalogApp['id']) => {
    const ids = id ? [id] : CATALOG.map((a) => a.id);
    setStatus((s) => ({ ...s, ...Object.fromEntries(ids.map((i) => [i, 'loading' as const])) }));
    await Promise.all(
      ids.map(async (i) => {
        const st: AppStatus = i === 'google' ? ((await probeGoogle()) ? { state: 'ready' } : statusFromError('missing')) : await probeApp(i);
        setStatus((s) => ({ ...s, [i]: st }));
      }),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      check();
      listConnectors().then(setItems);
    }, [check]),
  );

  const connected = CATALOG.filter((a) => (status[a.id] as AppStatus | undefined)?.state === 'ready').length;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await check();
                setRefreshing(false);
              }}
            />
          }>
          <View>
            <ThemedText type="subtitle" style={styles.title}>
              연동 앱
            </ThemedText>
            <ThemedText themeColor="textSecondary" type="small">
              비서가 읽고 쓸 수 있는 내 앱이에요. 아래로 당기면 상태를 다시 확인해요. {connected}/{CATALOG.length} 연결됨
            </ThemedText>
          </View>

          {CATALOG.map((app) => (
            <AppCard key={app.id} app={app} status={status[app.id]} onCheck={() => check(app.id)} />
          ))}

          <Pressable accessibilityRole="button" onPress={() => setAdvanced((v) => !v)} style={styles.advHead}>
            <ThemedText type="smallBold">고급: 직접 만든 앱 등록 (HTTP) {advanced ? '▲' : '▼'}</ThemedText>
            {items.length > 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                {items.length}개 등록됨
              </ThemedText>
            )}
          </Pressable>
          {advanced && <HttpConnectors items={items} onChange={() => listConnectors().then(setItems)} />}
          <View style={{ height: BottomTabInset }} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );

}

function badge(app: CatalogApp, st: AppStatus | 'loading' | undefined, theme: ReturnType<typeof useTheme>) {
  if (!st || st === 'loading') return { label: '확인 중…', color: theme.textSecondary };
  if (st.state === 'ready') return { label: app.id === 'google' ? '연결됨' : '연결됨', color: theme.success };
  if (st.state === 'needs_launch') return { label: STATE_LABEL.needs_launch, color: theme.warn };
  return { label: app.id === 'google' ? '연결 안 됨' : STATE_LABEL[st.state], color: theme.danger };
}

function AppCard({ app, status, onCheck }: { app: CatalogApp; status: AppStatus | 'loading' | undefined; onCheck: () => void }) {
  const theme = useTheme();
  const b = badge(app, status, theme);
  const ready = status && status !== 'loading' && status.state === 'ready';
  const ts = status && status !== 'loading' ? status.ts : undefined;

  const open = async () => {
    if (!app.openUrl) return router.push('/settings');
    try {
      await Linking.openURL(app.openUrl);
    } catch {
      Alert.alert('앱을 열 수 없어요', `${app.name} 앱이 설치되어 있는지 확인해 주세요.`);
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.row}>
        <View style={[styles.emoji, { backgroundColor: theme.accentSoft }]}>
          <ThemedText style={styles.emojiT}>{app.emoji}</ThemedText>
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold" style={styles.name}>
            {app.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {app.tagline}
          </ThemedText>
        </View>
        <View style={[styles.badge, { backgroundColor: b.color + '22' }]}>
          {status === 'loading' || !status ? <ActivityIndicator size="small" color={theme.textSecondary} /> : null}
          <ThemedText type="small" style={{ color: b.color }}>
            {b.label}
          </ThemedText>
        </View>
      </View>

      {ready && ts ? (
        <ThemedText type="small" themeColor="textSecondary">
          마지막 데이터 {ago(ts)}
        </ThemedText>
      ) : status && status !== 'loading' && status.state !== 'ready' ? (
        <ThemedText type="small" themeColor="textSecondary">
          필요: {app.needs}
        </ThemedText>
      ) : null}

      <View style={styles.caps}>
        {app.read.map((t) => (
          <ThemedText key={t} type="small">
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              읽기{' '}
            </ThemedText>
            {t}
          </ThemedText>
        ))}
        {app.write.map((t) => (
          <ThemedText key={t} type="small">
            <ThemedText type="smallBold" style={{ color: theme.warn }}>
              쓰기{' '}
            </ThemedText>
            {t}
          </ThemedText>
        ))}
      </View>

      {ready && (
        <View style={styles.examples}>
          {app.examples.map((q) => (
            <Pressable key={q} accessibilityRole="button" onPress={() => router.push({ pathname: '/', params: { q } })} style={[styles.example, { backgroundColor: theme.accentSoft }]}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                “{q}”
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.row}>
        <View style={styles.flex}>
          <Button title={app.openUrl ? '앱 열기' : status && status !== 'loading' && status.state === 'ready' ? '설정에서 관리' : '설정에서 연결'} kind="soft" onPress={open} />
        </View>
        <View style={styles.flex}>
          <Button title="상태 확인" kind="soft" onPress={onCheck} />
        </View>
      </View>
    </ThemedView>
  );
}

function HttpConnectors({ items, onChange }: { items: StoredConnector[]; onChange: () => void }) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const manifest = await fetchManifest(url.trim(), token.trim() || undefined);
      const summary = manifest.tools.map((t) => `• ${t.name}${t.readOnly ? ' (조회)' : ' (실행 전 확인)'}`).join('\n');
      Alert.alert(`"${manifest.name}" 연결할까요?`, `이 앱이 비서에게 제공하는 기능:\n${summary}`, [
        { text: '취소', style: 'cancel' },
        {
          text: '연결',
          onPress: async () => {
            await saveConnector(manifest, token.trim() || undefined);
            setUrl('');
            setToken('');
            onChange();
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
    <View style={styles.http}>
      <ThemedText themeColor="textSecondary" type="small">
        앱이 공개한 매니페스트(https)를 등록하면 비서가 그 앱의 기능을 도구로 씁니다. 데이터를 바꾸는 기능은 실행 전에 항상 확인을 받아요. 위의 내 앱 4개는 따로 등록하지 않아도 돼요.
      </ThemedText>
      {items.map(({ manifest, enabled }) => (
        <ThemedView key={manifest.id} type="backgroundElement" style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <ThemedText type="smallBold">{manifest.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {manifest.tools.length}개 기능 · {manifest.transport.baseUrl}
              </ThemedText>
            </View>
            <Switch value={enabled} onValueChange={async (v) => { await setConnectorEnabled(manifest.id, v); onChange(); }} />
          </View>
          <Button
            title="삭제"
            kind="danger"
            onPress={() =>
              Alert.alert(`"${manifest.name}" 연결을 삭제할까요?`, undefined, [
                { text: '취소', style: 'cancel' },
                { text: '삭제', style: 'destructive', onPress: async () => { await removeConnector(manifest.id); onChange(); } },
              ])
            }
          />
        </ThemedView>
      ))}
      <Field placeholder="매니페스트 URL (https://…)" value={url} onChangeText={setUrl} keyboardType="url" />
      <Field placeholder="접근 토큰 (선택)" value={token} onChangeText={setToken} secureTextEntry />
      <Button title={busy ? '확인 중…' : '불러오기'} disabled={busy || !url.trim()} onPress={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: Spacing.three, gap: Spacing.three },
  title: { fontSize: 28, lineHeight: 36 },
  card: { padding: Spacing.three, borderRadius: 18, gap: Spacing.two + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  emoji: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emojiT: { fontSize: 22, lineHeight: 28 },
  name: { fontSize: 17 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: 3, maxWidth: 150 },
  caps: { gap: 3 },
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  example: { borderRadius: 14, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one + 2 },
  advHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.two },
  http: { gap: Spacing.three },
});

import type Anthropic from '@anthropic-ai/sdk';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { runTurn, trimHistory, type History } from '@/agent/agent';
import { loadHistory, saveHistory } from '@/agent/chatStore';
import type { AgentTool } from '@/agent/tool';
import { builtinTools } from '@/builtin/tools';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BRIEFING_PROMPT } from '@/core/briefing';
import { getApiKey, getModel } from '@/core/settings';
import { loadConnectorTools } from '@/connectors/registry';
import { integrationTools } from '@/integrations';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Item = { key: string; kind: 'user' | 'assistant' | 'tool'; text: string };

/** 저장된 API 히스토리를 화면용 말풍선 목록으로 바꾼다. tool_result 는 숨긴다. */
function toItems(history: History): Item[] {
  const items: Item[] = [];
  history.forEach((m, i) => {
    if (typeof m.content === 'string') {
      items.push({ key: `${i}`, kind: m.role === 'user' ? 'user' : 'assistant', text: m.content });
      return;
    }
    if (m.role !== 'assistant') return;
    (m.content as Anthropic.ContentBlockParam[]).forEach((b, j) => {
      if (b.type === 'text' && b.text.trim()) items.push({ key: `${i}-${j}`, kind: 'assistant', text: b.text });
      if (b.type === 'tool_use') items.push({ key: `${i}-${j}`, kind: 'tool', text: `도구 실행: ${b.name}` });
    });
  });
  return items;
}

async function askConfirm(tool: AgentTool, input: Record<string, unknown>): Promise<boolean> {
  // 도구가 사람이 읽는 설명(예: 삭제할 일정의 제목·시간)을 줄 수 있으면 그걸 보여 준다. 실패하면 입력 JSON.
  let detail: string | null = null;
  if (tool.preview) {
    try {
      detail = await tool.preview(input);
    } catch {
      detail = null;
    }
  }
  return new Promise((resolve) => {
    Alert.alert(
      `${tool.label} 실행할까요?`,
      (detail ?? JSON.stringify(input, null, 2)).slice(0, 800),
      [
        { text: '거부', style: 'cancel', onPress: () => resolve(false) },
        { text: '실행', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export default function ChatScreen() {
  const theme = useTheme();
  const [history, setHistory] = useState<History>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<History>([]);
  const busyRef = useRef(false);
  const handledNotification = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();

  // 탭으로 돌아올 때마다 저장된 대화를 다시 읽는다 (설정에서 기록을 지운 경우 반영). 진행 중에는 건드리지 않는다.
  useFocusEffect(
    useCallback(() => {
      if (busyRef.current) return;
      loadHistory().then((h) => {
        historyRef.current = h;
        setHistory(h);
      });
    }, []),
  );

  const send = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText || busy) return;
    setError(null);
    const apiKey = await getApiKey();
    if (!apiKey) {
      setError('설정 탭에서 Claude API 키를 먼저 입력해 주세요.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setInput('');
    try {
      const tools = [...builtinTools, ...(await integrationTools()), ...(await loadConnectorTools())];
      const final = await runTurn({
        apiKey,
        model: await getModel(),
        history: trimHistory(historyRef.current),
        userText,
        tools,
        confirm: askConfirm,
        onUpdate: (h) => {
          historyRef.current = h;
          setHistory(h);
        },
      });
      await saveHistory(final);
    } catch (e) {
      // 실패해도 지금까지의 대화는 보존하되, 끝이 tool_use 로 끊긴 불완전 상태는 저장하지 않는다.
      setError(e instanceof Error ? e.message : String(e));
      historyRef.current = trimHistory(await loadHistory());
      setHistory(historyRef.current);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [busy]);

  // 아침 브리핑 알림을 눌러 앱을 연 경우 브리핑을 생성한다.
  useEffect(() => {
    if (!lastResponse) return;
    const id = lastResponse.notification.request.identifier + lastResponse.notification.date;
    if (handledNotification.current === id) return;
    if (lastResponse.notification.request.content.data?.type === 'briefing') {
      handledNotification.current = id;
      queueMicrotask(() => send(BRIEFING_PROMPT));
    }
  }, [lastResponse, send]);

  const items = useMemo(() => toItems(history), [history]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <ThemedText themeColor="textSecondary" style={styles.empty}>
                「내일 오후 3시에 치과 예약 할 일로 추가해줘」처럼 말해 보세요.
              </ThemedText>
            }
            renderItem={({ item }) =>
              item.kind === 'tool' ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.tool}>
                  {item.text}
                </ThemedText>
              ) : (
                <View
                  style={[
                    styles.bubble,
                    item.kind === 'user'
                      ? { alignSelf: 'flex-end', backgroundColor: theme.backgroundSelected }
                      : { alignSelf: 'flex-start', backgroundColor: theme.backgroundElement },
                  ]}>
                  <ThemedText selectable>{item.text}</ThemedText>
                </View>
              )
            }
          />
          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}
          <View style={[styles.inputRow, { borderTopColor: theme.backgroundSelected }]}>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              placeholder="비서에게 말하기"
              placeholderTextColor={theme.textSecondary}
              value={input}
              onChangeText={setInput}
              multiline
              editable={!busy}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="보내기"
              disabled={busy || !input.trim()}
              onPress={() => send(input)}
              style={[styles.send, { backgroundColor: theme.text, opacity: busy || !input.trim() ? 0.4 : 1 }]}>
              {busy ? (
                <ActivityIndicator color={theme.background} />
              ) : (
                <ThemedText style={{ color: theme.background }}>보내기</ThemedText>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: Spacing.six },
  bubble: { maxWidth: '85%', padding: Spacing.three, borderRadius: 16 },
  tool: { alignSelf: 'center' },
  error: { color: '#D93025', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    padding: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, maxHeight: 120, borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  send: { borderRadius: 20, paddingHorizontal: Spacing.three, height: 44, justifyContent: 'center' },
});

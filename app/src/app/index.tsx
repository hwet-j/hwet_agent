import type Anthropic from '@anthropic-ai/sdk';
import * as Notifications from 'expo-notifications';
import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { runTurn, trimHistory, type History } from '@/agent/agent';
import { loadHistory, saveHistory } from '@/agent/chatStore';
import { summarize } from '@/agent/activityPure';
import type { AgentTool, OpenLink } from '@/agent/tool';
import { builtinTools } from '@/builtin/tools';
import { RichText } from '@/components/rich-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { logActivity } from '@/core/activity';
import { BRIEFING_PROMPT } from '@/core/briefing';
import { getApiKey, getModel } from '@/core/settings';
import { loadConnectorTools } from '@/connectors/registry';
import { allIntegrationTools, integrationTools } from '@/integrations';
import { buildCalendarShowLink } from '@/integrations/calendar/pure';
import { buildLeaselogLink } from '@/integrations/leaselog/pure';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Item =
  | { key: string; kind: 'user' | 'assistant'; text: string }
  | { key: string; kind: 'tool'; tool: string; text: string; icon: string; failed: boolean }
  | { key: string; kind: 'link'; link: OpenLink };

const META = new Map<string, AgentTool>([...builtinTools, ...allIntegrationTools()].map((t) => [t.name, t]));
const QUICK = ['오늘 일정', '이번 달 지출', '이번 달 미납', '남은 할 일', '통장 잔액'];
const SUGGESTIONS = [
  '이번 주 일정 알려줘',
  '저번 달 월 수입 알려줘',
  '이번 달 미납 있어?',
  '내일 오후 3시 치과 약속 잡아줘',
  '남은 할 일 정리해줘',
  '점심 9천원 먹었어',
  '이번 달 어디에 돈 많이 썼어?',
];

/** 저장된 API 히스토리를 화면용 목록으로 바꾼다. tool_result 는 숨기되 실패 여부만 도구 칩에 반영한다. */
function toItems(history: History): Item[] {
  const failed = new Set<string>();
  for (const m of history) {
    if (m.role !== 'user' || typeof m.content === 'string') continue;
    for (const b of m.content as Anthropic.ContentBlockParam[]) if (b.type === 'tool_result' && b.is_error) failed.add(b.tool_use_id);
  }
  const items: Item[] = [];
  history.forEach((m, i) => {
    if (typeof m.content === 'string') {
      items.push({ key: `${i}`, kind: m.role === 'user' ? 'user' : 'assistant', text: m.content });
      return;
    }
    if (m.role !== 'assistant') return;
    (m.content as Anthropic.ContentBlockParam[]).forEach((b, j) => {
      if (b.type === 'text' && b.text.trim()) items.push({ key: `${i}-${j}`, kind: 'assistant', text: b.text });
      if (b.type === 'tool_use') {
        const t = META.get(b.name);
        const input = (b.input ?? {}) as Record<string, unknown>;
        const ok = !failed.has(b.id);
        items.push({
          key: `${i}-${j}`, kind: 'tool', tool: b.name, failed: !ok,
          text: t ? summarize(t, input) : b.name,
          icon: !t ? '•' : t.handoff ? '↗' : t.readOnly ? '🔎' : '✏️',
        });
        // 조회·화면 열기 도구는 해당 앱 화면을 여는 버튼을 붙인다 (성공했을 때만)
        const link = ok ? t?.openLink?.(input) : null;
        if (link) items.push({ key: `${i}-${j}-l`, kind: 'link', link });
      }
    });
  });
  return items;
}

async function openAppLink(link: OpenLink) {
  const url =
    link.app === 'leaselog' ? buildLeaselogLink('show', link.input) : link.app === 'calendar' ? buildCalendarShowLink(link.date) : `flowledger://${link.path}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('앱을 열 수 없어요', `${link.app === 'leaselog' ? 'LeaseLog' : link.app === 'calendar' ? '캘린더' : 'FlowLedger'} 앱이 설치되어 있는지 확인해 주세요.`);
  }
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
  const [hasKey, setHasKey] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const [lastText, setLastText] = useState('');
  const { q } = useLocalSearchParams<{ q?: string }>();
  const historyRef = useRef<History>([]);
  const busyRef = useRef(false);
  const handledNotification = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();

  // 탭으로 돌아올 때마다 저장된 대화를 다시 읽는다 (설정에서 기록을 지운 경우 반영). 진행 중에는 건드리지 않는다.
  useFocusEffect(
    useCallback(() => {
      getApiKey().then((k) => setHasKey(!!k));
      if (busyRef.current) return;
      loadHistory().then((h) => {
        historyRef.current = h;
        setHistory(h);
      });
    }, []),
  );

  // 연동 앱 탭의 예시 문구를 누르면 입력창에 채워 준다
  useEffect(() => {
    if (typeof q === 'string' && q) {
      queueMicrotask(() => setInput(q));
      router.setParams({ q: '' });
    }
  }, [q]);

  const send = useCallback(async (text: string) => {
    const userText = text.trim();
    if (!userText || busy) return;
    setError(null);
    const apiKey = await getApiKey();
    if (!apiKey) {
      setError('설정 탭에서 Claude API 키를 먼저 입력해 주세요.');
      return;
    }
    setLastText(userText);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
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
        signal: ctrl.signal,
        tools,
        confirm: askConfirm,
        onActivity: (a) => {
          void logActivity({
            tool: a.tool, label: a.label, summary: a.summary, kind: a.kind, status: a.status,
            user_text: a.userText, input: a.input, result: a.result,
          });
        },
        onUpdate: (h) => {
          historyRef.current = h;
          setHistory(h);
        },
      });
      await saveHistory(final);
    } catch (e) {
      // 실패해도 지금까지의 대화는 보존하되, 끝이 tool_use 로 끊긴 불완전 상태는 저장하지 않는다.
      const msg = e instanceof Error ? e.message : String(e);
      if (ctrl.signal.aborted) {
        // 사용자가 중단: 진행 중이던 대화는 저장된 상태로 되돌린다
        historyRef.current = trimHistory(await loadHistory());
        setHistory(historyRef.current);
        setError('중단했어요.');
      } else if (/thinking/i.test(msg) && /signature|different conversation/i.test(msg)) {
        // 예전 버전이 저장한 대화 기록과 맞지 않는 경우: 기록을 비우고 다시 시도하도록 안내
        await saveHistory([]);
        historyRef.current = [];
        setHistory([]);
        setError('이전 대화 기록과 호환되지 않아 기록을 정리했어요. 같은 말을 한 번 더 보내 주세요.');
      } else {
        setError(msg);
        historyRef.current = trimHistory(await loadHistory());
        setHistory(historyRef.current);
      }
    } finally {
      abortRef.current = null;
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
  const listRef = useRef<FlatList<Item>>(null);
  const last = items[items.length - 1];
  // 비서가 일하는 중(마지막이 내 말이거나 도구 호출)이면 "생각 중" 표시
  const thinking = busy && (!last || last.kind === 'user' || last.kind === 'tool' || last.kind === 'link');

  const newChat = () =>
    Alert.alert('새 대화를 시작할까요?', '지금까지의 대화 내용이 지워져요. (활동 기록 탭의 기록은 남아요)', [
      { text: '취소', style: 'cancel' },
      {
        text: '새 대화',
        style: 'destructive',
        onPress: async () => {
          await saveHistory([]);
          historyRef.current = [];
          setHistory([]);
          setError(null);
        },
      },
    ]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            비서
          </ThemedText>
          {items.length > 0 && !busy && (
            <Pressable accessibilityRole="button" accessibilityLabel="새 대화" onPress={newChat} hitSlop={8}
              style={[styles.newChat, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small">새 대화</ThemedText>
            </Pressable>
          )}
        </View>
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <FlatList
            ref={listRef}
            data={items}
            keyExtractor={(i) => i.key}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                {!hasKey && (
                  <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={[styles.onboard, { backgroundColor: theme.accentSoft }]}>
                    <ThemedText type="smallBold" style={{ color: theme.accent }}>
                      먼저 Claude API 키를 등록해 주세요 →
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      설정 탭에서 키를 저장하면 바로 대화할 수 있어요.
                    </ThemedText>
                  </Pressable>
                )}
                <ThemedText type="subtitle" style={styles.emptyTitle}>
                  무엇을 도와드릴까요?
                </ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.emptySub}>
                  일정·할 일·메모, 가계부(FlowLedger)·월세(LeaseLog)·캘린더 앱까지 말로 처리해요.
                </ThemedText>
                <View style={styles.chips}>
                  {SUGGESTIONS.map((q) => (
                    <Pressable key={q} accessibilityRole="button" onPress={() => send(q)} disabled={busy}
                      style={[styles.chip, { backgroundColor: theme.accentSoft }]}>
                      <ThemedText type="small" style={{ color: theme.accent }}>
                        {q}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            }
            ListFooterComponent={
              thinking ? (
                <View style={[styles.bubble, styles.thinking, { backgroundColor: theme.backgroundElement }]}>
                  <ActivityIndicator size="small" color={theme.accent} />
                  <ThemedText type="small" themeColor="textSecondary">
                    생각 중…
                  </ThemedText>
                </View>
              ) : undefined
            }
            renderItem={({ item }) => {
              if (item.kind === 'tool') {
                return (
                  <View style={[styles.toolChip, { backgroundColor: item.failed ? theme.danger + '22' : theme.backgroundElement }]}>
                    <ThemedText type="small" style={{ color: item.failed ? theme.danger : theme.textSecondary }} numberOfLines={2}>
                      {item.icon} {item.text}
                      {item.failed ? ' · 실패' : ''}
                    </ThemedText>
                  </View>
                );
              }
              if (item.kind === 'link') {
                return (
                  <Pressable accessibilityRole="button" onPress={() => openAppLink(item.link)}
                    style={[styles.linkBtn, { borderColor: theme.accent }]}>
                    <ThemedText type="smallBold" style={{ color: theme.accent }}>
                      ↗ {item.link.label}
                    </ThemedText>
                  </Pressable>
                );
              }
              const mine = item.kind === 'user';
              return (
                <Pressable
                  onLongPress={async () => {
                    await Clipboard.setStringAsync(item.text);
                    Alert.alert('복사했어요');
                  }}
                  delayLongPress={350}
                  style={[styles.bubble, mine ? [styles.mine, { backgroundColor: theme.accent }] : [styles.theirs, { backgroundColor: theme.backgroundElement }]]}>
                  {mine ? <ThemedText selectable style={{ color: '#fff' }}>{item.text}</ThemedText> : <RichText text={item.text} color={theme.text} />}
                </Pressable>
              );
            }}
          />
          {error && (
            <View style={[styles.errorBar, { backgroundColor: theme.danger + '1A' }]}>
              <ThemedText type="small" style={[styles.flex, { color: theme.danger }]}>
                {error}
              </ThemedText>
              {lastText && !busy ? (
                <Pressable accessibilityRole="button" onPress={() => send(lastText)} hitSlop={8}>
                  <ThemedText type="smallBold" style={{ color: theme.danger }}>
                    다시 시도
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          )}
          {!busy && !input && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quick}>
              {QUICK.map((qq) => (
                <Pressable key={qq} accessibilityRole="button" onPress={() => send(qq)} style={[styles.quickChip, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small">{qq}</ThemedText>
                </Pressable>
              ))}
            </ScrollView>
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
            {busy ? (
              <Pressable accessibilityRole="button" accessibilityLabel="중단" onPress={() => abortRef.current?.abort()} style={[styles.send, { backgroundColor: theme.danger }]}>
                <View style={styles.stopIcon} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="보내기"
                disabled={!input.trim()}
                onPress={() => send(input)}
                style={[styles.send, { backgroundColor: theme.accent, opacity: !input.trim() ? 0.4 : 1 }]}>
                <ThemedText style={styles.sendIcon}>↑</ThemedText>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.one },
  title: { fontSize: 28, lineHeight: 36 },
  newChat: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  list: { padding: Spacing.three, gap: Spacing.two, flexGrow: 1 },
  emptyBox: { marginTop: Spacing.five, gap: Spacing.two, alignItems: 'center' },
  emptyTitle: { textAlign: 'center' },
  emptySub: { textAlign: 'center', marginBottom: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two },
  chip: { borderRadius: 18, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bubble: { maxWidth: '86%', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderRadius: 18 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  thinking: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  toolChip: { alignSelf: 'flex-start', maxWidth: '92%', borderRadius: 12, paddingHorizontal: Spacing.two + 2, paddingVertical: Spacing.one + 1 },
  linkBtn: { alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginHorizontal: Spacing.two, marginBottom: Spacing.one, padding: Spacing.two + 2, borderRadius: 12 },
  onboard: { alignSelf: 'stretch', borderRadius: 16, padding: Spacing.three, gap: 2, marginBottom: Spacing.three },
  quick: { gap: Spacing.two, paddingHorizontal: Spacing.two, paddingBottom: Spacing.two },
  quickChip: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 3 },
  stopIcon: { width: 14, height: 14, borderRadius: 3, backgroundColor: '#fff' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, maxHeight: 120, borderRadius: 22, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  send: { borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { color: '#fff', fontSize: 22, lineHeight: 26, fontWeight: '700' },
});

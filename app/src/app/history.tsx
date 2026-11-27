import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { clearActivity, listActivity, type ActivityRow } from '@/core/activity';
import { dayLabel, FILTERS, filterRows, groupByDay, statusInfo, timeLabel, type Filter } from '@/core/activityView';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 비서가 한 일의 기록. 내가 뭘 시켰는지, 언제 했는지, 잘 됐는지 확인하고 잘못된 지시를 되짚어 볼 수 있다. */
export default function HistoryScreen() {
  const theme = useTheme();
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      listActivity().then(setRows).catch(() => {});
    }, []),
  );

  const sections = useMemo(() => groupByDay(filterRows(rows, filter)), [rows, filter]);

  const clear = () =>
    Alert.alert('기록을 모두 지울까요?', '비서가 한 일의 기록만 지워지고, 이미 처리된 일정·메모·할 일은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: async () => { await clearActivity(); setRows([]); } },
    ]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>활동 기록</ThemedText>
          {rows.length > 0 && (
            <Pressable accessibilityRole="button" accessibilityLabel="기록 지우기" onPress={clear} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">지우기</ThemedText>
            </Pressable>
          )}
        </View>
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable key={f.id} accessibilityRole="button" accessibilityState={{ selected: filter === f.id }} onPress={() => setFilter(f.id)}
              style={[styles.filter, { backgroundColor: filter === f.id ? theme.accent : theme.backgroundElement }]}>
              <ThemedText type="small" style={{ color: filter === f.id ? '#fff' : theme.text }}>{f.label}</ThemedText>
            </Pressable>
          ))}
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(r) => String(r.id)}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {rows.length ? '이 분류에는 기록이 없어요.' : '아직 기록이 없어요.\n비서가 일정·메모를 만들거나 조회하면 여기에 남아요.'}
            </ThemedText>
          }
          renderSectionHeader={({ section }) => (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>{dayLabel(section.day)}</ThemedText>
          )}
          renderItem={({ item }) => {
            const st = statusInfo(item);
            const color = theme[st.color];
            const expanded = open === item.id;
            return (
              <Pressable accessibilityRole="button" onPress={() => setOpen(expanded ? null : item.id)}
                style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
                <View style={styles.row}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.time}>{timeLabel(item.ts)}</ThemedText>
                  <ThemedText style={styles.summary} numberOfLines={expanded ? undefined : 2}>{item.summary}</ThemedText>
                </View>
                <View style={styles.row}>
                  <View style={[styles.badge, { backgroundColor: color + '22' }]}>
                    <ThemedText type="small" style={{ color }}>{st.label}</ThemedText>
                  </View>
                  <ThemedText type="small" themeColor="textSecondary">{item.kind === 'read' ? '조회' : '변경'} · {item.label}</ThemedText>
                </View>
                {expanded && (
                  <View style={styles.detail}>
                    {item.user_text ? <Detail title="내가 한 말" text={item.user_text} /> : null}
                    {st.hint ? <Detail title="참고" text={st.hint} /> : null}
                    <Detail title="비서가 보낸 값" text={pretty(item.input)} mono />
                    {item.result ? <Detail title={item.status === 'error' || item.status === 'denied' ? '사유' : '결과'} text={item.result} mono /> : null}
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function pretty(json: string | null) {
  if (!json) return '(없음)';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function Detail({ title, text, mono }: { title: string; text: string; mono?: boolean }) {
  return (
    <View style={styles.detailBox}>
      <ThemedText type="smallBold" themeColor="textSecondary">{title}</ThemedText>
      <ThemedText type={mono ? 'code' : 'small'} selectable style={mono ? styles.mono : undefined}>{text}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  title: { fontSize: 28, lineHeight: 36 },
  filters: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  filter: { borderRadius: 16, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  list: { paddingHorizontal: Spacing.three, paddingBottom: BottomTabInset + Spacing.four, gap: Spacing.two },
  section: { marginTop: Spacing.three, marginBottom: Spacing.one },
  empty: { textAlign: 'center', marginTop: Spacing.six, lineHeight: 24 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  time: { width: 44 },
  summary: { flex: 1 },
  badge: { borderRadius: 10, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  detail: { gap: Spacing.two, marginTop: Spacing.one },
  detailBox: { gap: 2 },
  mono: { fontSize: 12, lineHeight: 17 },
});

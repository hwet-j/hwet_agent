import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { parseBlocks, type Seg } from './richTextPure';

function Segs({ segs, color }: { segs: Seg[]; color: string }) {
  const theme = useTheme();
  return (
    <>
      {segs.map((s, i) => (
        <Text
          key={i}
          style={[
            { color },
            s.bold && styles.bold,
            s.code && [styles.code, { backgroundColor: theme.backgroundSelected, fontFamily: Fonts?.mono }],
          ]}>
          {s.text}
        </Text>
      ))}
    </>
  );
}

/** 비서 답변(마크다운 일부)을 말풍선 안에 그린다 */
export function RichText({ text, color }: { text: string; color: string }) {
  const theme = useTheme();
  const blocks = parseBlocks(text);
  return (
    <View style={styles.wrap}>
      {blocks.map((b, i) => {
        if (b.type === 'gap') return <View key={i} style={styles.gap} />;
        if (b.type === 'pre')
          return (
            <View key={i} style={[styles.pre, { backgroundColor: theme.backgroundSelected }]}>
              <Text style={{ color, fontFamily: Fonts?.mono, fontSize: 13, lineHeight: 19 }}>{b.text}</Text>
            </View>
          );
        if (b.type === 'li')
          return (
            <View key={i} style={styles.li}>
              <Text style={[styles.marker, { color: theme.textSecondary }]}>{b.marker}</Text>
              <Text style={[styles.text, { color }, styles.flex]} selectable>
                <Segs segs={b.segs} color={color} />
              </Text>
            </View>
          );
        return (
          <Text key={i} style={[styles.text, b.type === 'h' && styles.h, { color }]} selectable>
            <Segs segs={b.segs} color={color} />
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  flex: { flex: 1 },
  gap: { height: Spacing.two },
  text: { fontSize: 16, lineHeight: 24 },
  h: { fontWeight: '800', fontSize: 17, marginTop: 2 },
  bold: { fontWeight: '700' },
  code: { fontSize: 14, borderRadius: 4 },
  li: { flexDirection: 'row', gap: Spacing.two, paddingLeft: Spacing.one },
  marker: { fontSize: 16, lineHeight: 24, minWidth: 18 },
  pre: { borderRadius: 10, padding: Spacing.two + 2, marginVertical: 2 },
});

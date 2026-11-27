import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export function Field(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[styles.field, { color: theme.text, backgroundColor: theme.backgroundElement }, props.style]}
    />
  );
}

export type ButtonKind = 'primary' | 'soft' | 'danger';

export function Button({ title, onPress, disabled, kind = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; kind?: ButtonKind }) {
  const theme = useTheme();
  const bg = kind === 'primary' ? theme.accent : kind === 'danger' ? 'transparent' : theme.accentSoft;
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? theme.danger : theme.accent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : 1 }]}>
      <ThemedText type="smallBold" style={{ color: fg, fontSize: 16 }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

/** 설정 화면의 묶음 카드 */
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#8884', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  section: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two + 2 },
  button: { borderRadius: 12, paddingVertical: Spacing.two + 2, alignItems: 'center' },
});

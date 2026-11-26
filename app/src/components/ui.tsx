import { Pressable, StyleSheet, TextInput, type TextInputProps } from 'react-native';

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

export function Button({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, { backgroundColor: theme.text, opacity: disabled ? 0.4 : 1 }]}>
      <ThemedText style={{ color: theme.background }}>{title}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16 },
  button: { borderRadius: 12, paddingVertical: Spacing.two + 2, alignItems: 'center' },
});

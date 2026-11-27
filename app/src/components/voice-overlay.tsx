import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toSpeech } from '@/voice/speechText';
import type { VoiceSettings } from '@/voice/settings';
import { useVoice } from '@/voice/useVoice';

type Phase = 'listening' | 'thinking' | 'answer' | 'error';

/**
 * 음성 모드: 듣기 → (자동 전송) → 생각 중 → 답변 표시 + 음성으로 읽기 → (설정에 따라) 다시 듣기.
 * onSubmit 은 말한 내용을 비서에게 보내고 최종 답변 텍스트를 돌려준다.
 */
export function VoiceOverlay({ visible, onClose, onSubmit, settings }: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<string | null>;
  settings: VoiceSettings;
}) {
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('listening');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState('');
  const [pulse] = useState(() => new Animated.Value(1));
  const liveRef = useRef(true);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  const voiceRef = useRef<ReturnType<typeof useVoice> | null>(null);

  const speakThenMaybeListen = useCallback((text: string) => {
    const again = () => {
      if (liveRef.current && settingsRef.current.relisten) {
        setPhase('listening');
        voiceRef.current?.start();
      }
    };
    if (!settingsRef.current.tts) return again();
    Speech.speak(toSpeech(text), { language: 'ko-KR', onDone: again, onStopped: () => {}, onError: again });
  }, []);

  const handleFinal = useCallback(async (text: string) => {
    setHeard(text);
    setPhase('thinking');
    const a = await onSubmit(text);
    if (!liveRef.current) return;
    if (a == null) {
      setAnswer('');
      setPhase('error');
      return;
    }
    setAnswer(a);
    setPhase('answer');
    speakThenMaybeListen(a);
  }, [onSubmit, speakThenMaybeListen]);

  const voice = useVoice(handleFinal);
  useEffect(() => {
    voiceRef.current = voice;
  });

  useEffect(() => {
    liveRef.current = visible;
    if (visible) {
      queueMicrotask(() => {
        setHeard('');
        setAnswer('');
        setPhase('listening');
        voiceRef.current?.start();
      });
    } else {
      Speech.stop();
      voice.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    Animated.timing(pulse, { toValue: 1 + Math.min(Math.max(voice.level, 0), 10) / 25, duration: 90, useNativeDriver: true }).start();
  }, [voice.level, pulse]);

  const retry = () => {
    Speech.stop();
    setPhase('listening');
    voice.start();
  };

  const status =
    phase === 'listening' ? (voice.phase === 'error' ? (voice.error ?? '잘 못 들었어요') : '듣고 있어요…')
    : phase === 'thinking' ? '생각 중…'
    : phase === 'error' ? '답변을 받지 못했어요'
    : '';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.wrap, { backgroundColor: theme.background + 'F2' }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} style={styles.close} hitSlop={12}>
          <ThemedText style={styles.closeT}>✕</ThemedText>
        </Pressable>

        <View style={styles.center}>
          <Pressable onPress={() => (phase === 'listening' && voice.phase === 'listening' ? voice.stop() : retry())} accessibilityRole="button" accessibilityLabel="마이크">
            <Animated.View style={[styles.orb, { backgroundColor: voice.phase === 'error' || phase === 'error' ? theme.danger : theme.accent, transform: [{ scale: pulse }] }]}>
              <ThemedText style={styles.orbIcon}>{phase === 'thinking' ? '…' : '🎙'}</ThemedText>
            </Animated.View>
          </Pressable>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.status}>
            {status}
          </ThemedText>
          {phase === 'listening' && voice.partial ? <ThemedText type="subtitle" style={styles.heard}>{voice.partial}</ThemedText> : null}
          {phase !== 'listening' && heard ? <ThemedText themeColor="textSecondary" style={styles.heardSmall}>“{heard}”</ThemedText> : null}
        </View>

        {phase === 'answer' && (
          <ScrollView style={[styles.answerBox, { backgroundColor: theme.backgroundElement }]} contentContainerStyle={{ padding: Spacing.three }}>
            <ThemedText selectable>{answer}</ThemedText>
          </ScrollView>
        )}

        <View style={styles.actions}>
          {(phase === 'answer' || phase === 'error' || voice.phase === 'error') && (
            <Pressable accessibilityRole="button" onPress={retry} style={[styles.btn, { backgroundColor: theme.accent }]}>
              <ThemedText style={styles.btnT}>다시 말하기</ThemedText>
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.btn, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText>닫기</ThemedText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: Spacing.six, paddingBottom: Spacing.five, paddingHorizontal: Spacing.three },
  close: { position: 'absolute', top: Spacing.five, right: Spacing.three, zIndex: 2, padding: Spacing.two },
  closeT: { fontSize: 22 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  orb: { width: 132, height: 132, borderRadius: 66, alignItems: 'center', justifyContent: 'center' },
  orbIcon: { fontSize: 48, lineHeight: 56, color: '#fff' },
  status: { fontSize: 16 },
  heard: { textAlign: 'center', paddingHorizontal: Spacing.three },
  heardSmall: { textAlign: 'center', paddingHorizontal: Spacing.three },
  answerBox: { maxHeight: '38%', borderRadius: 16, marginBottom: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two, justifyContent: 'center' },
  btn: { borderRadius: 22, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + 2 },
  btnT: { color: '#fff', fontWeight: '700' },
});

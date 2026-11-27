import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

import { VoiceNative } from '../../modules/voice';
import { cleanTranscript } from './speechText';

export type VoicePhase = 'idle' | 'listening' | 'error';

/** 음성 인식 훅. final 은 인식이 끝났을 때 한 번 호출된다 */
export function useVoice(onFinal: (text: string) => void) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [partial, setPartial] = useState('');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef(onFinal);
  useEffect(() => {
    finalRef.current = onFinal;
  });

  useEffect(() => {
    const native = VoiceNative;
    if (!native) return;
    const subs = [
      native.addListener('onPartial', (e) => setPartial(cleanTranscript(String(e.text ?? '')))),
      native.addListener('onVolume', (e) => setLevel(Number(e.level) || 0)),
      native.addListener('onResult', (e) => {
        const t = cleanTranscript(String(e.text ?? ''));
        setPhase('idle');
        setLevel(0);
        if (t) finalRef.current(t);
        else {
          setError('잘 못 들었어요');
          setPhase('error');
        }
      }),
      native.addListener('onError', (e) => {
        setLevel(0);
        const m = String(e.message ?? '');
        setError(m === 'no_match' || m === 'no_speech' ? '잘 못 들었어요' : m === 'network' ? '음성 인식 서비스에 연결하지 못했어요' : m === 'permission' ? '마이크 권한이 필요해요' : '음성 인식에 실패했어요');
        setPhase('error');
      }),
    ];
    return () => {
      subs.forEach((s) => s.remove());
      native.cancel();
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setPartial('');
    if (!VoiceNative || Platform.OS !== 'android') {
      setError('이 기기에서는 음성 인식을 쓸 수 없어요');
      setPhase('error');
      return;
    }
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      setError('마이크 권한이 필요해요. 설정에서 허용해 주세요.');
      setPhase('error');
      return;
    }
    if (!VoiceNative.isAvailable()) {
      setError('기기의 음성 인식 서비스(구글 앱)를 찾을 수 없어요');
      setPhase('error');
      return;
    }
    setPhase('listening');
    VoiceNative.start('ko-KR');
  }, []);

  const stop = useCallback(() => {
    VoiceNative?.stop();
  }, []);
  const cancel = useCallback(() => {
    VoiceNative?.cancel();
    setPhase('idle');
    setLevel(0);
  }, []);

  return { phase, partial, level, error, start, stop, cancel };
}

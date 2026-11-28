import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import '@/automation/background'; // 백그라운드 작업 정의 (앱 시작 시 한 번 실행되어야 함)
import { sendDigestIfDue } from '@/automation/digest';
import { bridge } from '@/integrations/bridge';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  // 앱을 열 때도 알림 시각이 지났는데 아직 안 보냈다면 보낸다
  useEffect(() => {
    sendDigestIfDue().catch(() => {});
  }, []);
  // 연동 앱(LeaseLog·캘린더)이 조회 결과를 돌려보내는 hwetassistant://result 주소를 받는다
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      bridge.handle(url);
    });
    return () => sub.remove();
  }, []);
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
    </ThemeProvider>
  );
}

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { GlobalVoiceControl } from '@/src/ui/voice/GlobalVoiceControl';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="quick-quote" options={{ headerShown: false }} />
        <Stack.Screen name="estimate" options={{ headerShown: false }} />
        <Stack.Screen name="catalogue" options={{ headerShown: false }} />
        <Stack.Screen name="manage-jobs" options={{ headerShown: false }} />
        <Stack.Screen name="suppliers" options={{ headerShown: false }} />
        <Stack.Screen name="tools/index" options={{ headerShown: false }} />
        <Stack.Screen name="tools/voltage-drop" options={{ headerShown: false }} />
        <Stack.Screen name="tools/ohms-law" options={{ headerShown: false }} />
        <Stack.Screen name="business-profile" options={{ headerShown: false }} />
        <Stack.Screen name="voice-setup" options={{ headerShown: false }} />
        <Stack.Screen name="import" options={{ headerShown: false }} />
        <Stack.Screen name="project/new" options={{ headerShown: false }} />
        <Stack.Screen name="project/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="project/room/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="project/snag/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="project/drawings/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="project/quote/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <GlobalVoiceControl />
      <StatusBar style="auto" />
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}


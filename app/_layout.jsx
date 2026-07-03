import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { theme } from '../src/lib/theme.js';

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          animation: 'fade',
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      />
      <StatusBar style="light" />
    </>
  );
}

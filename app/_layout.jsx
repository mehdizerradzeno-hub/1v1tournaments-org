import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';

import { theme } from '../src/lib/theme.js';

export default function RootLayout() {
  return (
    <>
      <Head>
        <title>1v1 Tournaments</title>
        <meta
          name="description"
          content="Free-entry 1v1 card-game tournaments for Spades, with Euchre coming soon."
        />
      </Head>
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

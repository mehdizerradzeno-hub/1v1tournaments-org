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
          content="One account for competitive Spades and Euchre, tournaments, leagues, rankings, and results."
        />
        <style>{`
          html,
          body,
          #root {
            background: ${theme.colors.background};
            min-height: 100%;
          }
        `}</style>
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

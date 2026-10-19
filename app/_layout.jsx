import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';

import '../src/styles/publicCards.css';

import { theme } from '../src/lib/theme.js';

export default function RootLayout() {
  return (
    <>
      <Head>
        <title>1v1 Tournaments</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&family=Kufam:wght@500;600;700;800;900&display=swap"
          rel="stylesheet"
        />
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

          body {
            font-family: "DM Sans", Arial, sans-serif;
          }

          #root :is(a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [role="radio"]):focus-visible {
            outline: 3px solid ${theme.colors.accent};
            outline-offset: 4px;
          }

          #root :is(input, textarea, select):focus-visible {
            outline-offset: 2px;
          }

          @media (prefers-reduced-motion: reduce) {
            #root { scroll-behavior: auto; }
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

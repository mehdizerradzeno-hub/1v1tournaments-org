import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const tournamentScreenFile = fileURLToPath(new URL('../src/screens/TournamentScreen.jsx', import.meta.url));
const tournamentScreenSource = readFileSync(tournamentScreenFile, 'utf8');
const hubUiFile = fileURLToPath(new URL('../src/components/hub-ui.jsx', import.meta.url));
const hubUiSource = readFileSync(hubUiFile, 'utf8');

function hubViewportMarkup({ hydrated, width }) {
  const hasHydratedViewport = hydrated && width > 0;
  const showMobileNav = hasHydratedViewport && width < 720;

  return {
    showMobileNav,
    showTopNav: !showMobileNav,
    showLaptopLayout: hasHydratedViewport && width >= 1360,
    showTinyHeader: hasHydratedViewport && width < 520,
    showStickyActions: !showMobileNav,
    showDockedMobileNav: showMobileNav,
    showStickyActionCopy: hasHydratedViewport && width >= 430,
  };
}

test('the Twitch arrival actions take the available row at phone widths', () => {
  assert.match(tournamentScreenSource, /const usePhoneActionLayout = width > 0 && width <= 430;/);
  assert.match(
    tournamentScreenSource,
    /style=\{\[styles\.arrivalActions, usePhoneActionLayout && styles\.arrivalActionsPhone\]\}/,
  );
  assert.match(
    tournamentScreenSource,
    /arrivalActionsPhone:\s*\{\s*flexBasis: '100%',\s*width: '100%',\s*\}/,
  );
  assert.match(tournamentScreenSource, /arrivalActions:\s*\{[\s\S]*?flexWrap: 'wrap'/);
});

test('every Twitch arrival action preserves a 44px minimum touch target', () => {
  assert.equal((tournamentScreenSource.match(/style=\{styles\.arrivalAction\}/g) || []).length, 3);
  assert.match(tournamentScreenSource, /arrivalAction:\s*\{\s*minHeight: 44,\s*\}/);
});

test('the longest tournament tab uses a compact phone label', () => {
  assert.match(tournamentScreenSource, /const compact = width > 0 && width < 520;/);
  assert.match(tournamentScreenSource, /compact && tab\.id === 'info' \? 'Details' : tab\.label/);
});

test('homepage and event routes defer viewport-dependent markup until after hydration', () => {
  const routeSources = [
    readFileSync(fileURLToPath(new URL('../app/index.jsx', import.meta.url)), 'utf8'),
    readFileSync(fileURLToPath(new URL('../app/tournaments/[slug].jsx', import.meta.url)), 'utf8'),
  ];

  assert.match(routeSources[0], /HomeScreen/);
  assert.match(routeSources[1], /TournamentScreen/);
  assert.match(hubUiSource, /const isHydrated = useHydrated\(\);/);
  assert.match(hubUiSource, /const hasHydratedViewport = isHydrated && width > 0;/);
  assert.match(hubUiSource, /showMobileNav = [^;]*hasHydratedViewport && width < 720;/);
  assert.match(hubUiSource, /showLaptopLayout = [^;]*hasHydratedViewport && width >= 1360;/);
  assert.match(hubUiSource, /showTinyHeader = hasHydratedViewport && width < 520;/);
  assert.match(hubUiSource, /showStickyActionCopy = hasHydratedViewport && width >= 430;/);
  assert.match(hubUiSource, /accessibilityRole="navigation"/);
  assert.match(hubUiSource, /safeArea:\s*\{[\s\S]*?minHeight: 0,[\s\S]*?overflow: 'hidden'/);

  for (const route of ['homepage', 'reddit event']) {
    for (const width of [390, 1920]) {
      const serverMarkup = hubViewportMarkup({ hydrated: false, width: 0 });
      const firstClientMarkup = hubViewportMarkup({ hydrated: false, width });
      assert.deepEqual(firstClientMarkup, serverMarkup, `${route} at ${width}px must hydrate the server markup`);
    }
  }

  assert.equal(hubViewportMarkup({ hydrated: true, width: 390 }).showMobileNav, true);
  assert.equal(hubViewportMarkup({ hydrated: true, width: 1920 }).showLaptopLayout, true);
});

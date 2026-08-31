import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const tournamentScreenFile = fileURLToPath(new URL('../src/screens/TournamentScreen.jsx', import.meta.url));
const tournamentScreenSource = readFileSync(tournamentScreenFile, 'utf8');
const hubUiFile = fileURLToPath(new URL('../src/components/hub-ui.jsx', import.meta.url));
const hubUiSource = readFileSync(hubUiFile, 'utf8');
const masterUiSource = readFileSync(
  fileURLToPath(new URL('../src/components/tournament-master-ui.jsx', import.meta.url)),
  'utf8',
);
const responsiveCssSource = readFileSync(
  fileURLToPath(new URL('../src/styles/tournamentResponsive.css', import.meta.url)),
  'utf8',
);

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

test('master journey stays usable at phone and 914x335-style short-landscape viewports', () => {
  assert.match(masterUiSource, /width > 0 && width <= 520/);
  assert.match(masterUiSource, /width > height && height > 0 && height <= 360/);
  assert.match(masterUiSource, /stepsPhone:\s*\{\s*flexDirection: 'column'/);
  assert.match(masterUiSource, /tournamentJourneySteps: 'true'/);
  assert.match(masterUiSource, /tournamentJourneyStep: 'true'/);
  assert.match(responsiveCssSource, /orientation: landscape/);
  assert.match(responsiveCssSource, /max-height: 360px/);
  assert.match(responsiveCssSource, /max-width: 100%/);
  assert.match(responsiveCssSource, /data-tournament-journey-steps="true"/);
  assert.match(responsiveCssSource, /data-tournament-journey-step="true"/);
  assert.doesNotMatch(responsiveCssSource, /overflow-x:\s*(hidden|clip)/);
});

test('the player owns one match launcher and public bracket cards stay view-only', () => {
  assert.equal((tournamentScreenSource.match(/issueTournamentMatchTicket/g) || []).length, 2);
  assert.match(tournamentScreenSource, /PLAY MATCH/);
  assert.doesNotMatch(tournamentScreenSource, /Open My Match/);
  assert.doesNotMatch(tournamentScreenSource, />Play match</);
  assert.match(tournamentScreenSource, /Ready for assigned players/);
  assert.match(responsiveCssSource, /min-height: 44px/);
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

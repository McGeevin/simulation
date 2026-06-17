// ============================================================
// AEON :: GAME CONFIG  (Feature 1 foundation)
// Single source of truth for every new feature module. The base
// simulation never reads this object, so with all toggles off (or
// this file absent) AEON behaves exactly as it always has.
//
// Every new module reads from `gameConfig` and degrades gracefully
// when its flag is false. Crisis Events OFF == zero behaviour change.
// ============================================================

const gameConfig = {
  // ── Mode / player ──────────────────────────────────────────
  mode: 'sandbox',          // sandbox | campaign | ironman | legacy (campaign not yet built)
  playerSide: 'A',          // which configured side the human "plays as"

  // ── Crisis Events (Feature 2) ──────────────────────────────
  crisisEnabled: true,
  crisisInterval: 75,       // 50 | 75 | 100  (years between checks)

  // ── AI Doctrines (Feature 3) ───────────────────────────────
  // The doctrine chosen here is given to the primary antagonist; the
  // other rivals are assigned doctrines at game start.
  antagonistDoctrine: 'expansionist',

  // ── Diplomacy (Feature 4) ──────────────────────────────────
  diplomacyDepth: 'full',   // simple | full

  // ── Convergence / final battle (Feature 5) ─────────────────
  convergenceEnabled: true,

  // ── Ironman / Legacy (Feature 6) ───────────────────────────
  ironman: false,
};

// Persist only the *options* (not game saves) so the menu remembers them.
const AEON_CONFIG_KEY = 'aeon_options';

function saveGameConfig() {
  try {
    const slim = {
      crisisEnabled: gameConfig.crisisEnabled,
      crisisInterval: gameConfig.crisisInterval,
      antagonistDoctrine: gameConfig.antagonistDoctrine,
      diplomacyDepth: gameConfig.diplomacyDepth,
      convergenceEnabled: gameConfig.convergenceEnabled,
      ironman: gameConfig.ironman,
    };
    localStorage.setItem(AEON_CONFIG_KEY, JSON.stringify(slim));
  } catch (_) { /* storage may be unavailable; options just won't persist */ }
}

function loadGameConfig() {
  try {
    const raw = localStorage.getItem(AEON_CONFIG_KEY);
    if (!raw) return;
    const slim = JSON.parse(raw);
    if (slim && typeof slim === 'object') Object.assign(gameConfig, slim);
  } catch (_) { /* ignore corrupt config */ }
}

// ── Shared helpers used across feature modules ────────────────

// The human player's civ for this run (or null in pure-spectator setups).
function aeonPlayerCiv() {
  if (typeof Game === 'undefined' || !Game.civs) return null;
  return Game.civs.find(c => c.side === gameConfig.playerSide) || null;
}

// Every civ that is NOT the player — the rivals.
function aeonRivals() {
  if (typeof Game === 'undefined' || !Game.civs) return [];
  return Game.civs.filter(c => c.side !== gameConfig.playerSide);
}

// Are we on a deterministic / non-interactive run path? Interactive modals
// must never fire during a multiplayer replay (choices aren't encoded in the
// shared seed) — they auto-resolve deterministically instead.
function aeonIsDeterministicRun() {
  return typeof MP !== 'undefined' && MP.active;
}

// Convergence/crisis timings are written for a 1,000-year game. Scale them so
// they spread sensibly across 500 / 2,000 / 5,000 / 10,000-year runs too.
function aeonYearScale() {
  const maxY = (typeof Game !== 'undefined' && Game.maxYear) ? Game.maxYear : 1000;
  return maxY / 1000;
}

// Do we have any past-run chronicles (drives "World History" / "Continue")?
function aeonHasChronicles() {
  try {
    const raw = localStorage.getItem('aeon_chronicles');
    if (!raw) return false;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length > 0;
  } catch (_) { return false; }
}

if (typeof window !== 'undefined') {
  window.gameConfig = gameConfig;
}

import { getPage } from "./browser.js";
import type { Pos } from "./grid.js";

export async function clickCell(pos: Pos): Promise<void> {
  const page = await getPage();
  const selector = `#board .cell[data-coord="${pos.col},${pos.row}"]`;
  await page.click(selector);
  console.log(`[click] cell (${pos.col},${pos.row})`);
}

export async function clickAction(label: string): Promise<void> {
  const page = await getPage();
  await page.click(`.action-btn:has-text("${label}")`, { timeout: 10000 });
  console.log(`[click] action "${label}"`);
}

// Returns true if the named action button is visible AND enabled (not disabled/unaffordable).
export async function isActionEnabled(label: string): Promise<boolean> {
  const page = await getPage();
  try {
    const btn = page.locator(`.action-btn:has-text("${label}")`);
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    return btn.isEnabled();
  } catch {
    return false;
  }
}

export async function clickSubmitIntent(): Promise<void> {
  const page = await getPage();
  await page.waitForSelector(
    '.submit-btn, button:has-text("Submit Intent"), button:has-text("Submit")',
    { timeout: 5000 },
  );
  await page.click(
    '.submit-btn, button:has-text("Submit Intent"), button:has-text("Submit")',
  );
  console.log("[click] submit intent");
}

// Waits for the intent phase. Throws BattleEndedError if the battle ends before the phase arrives.
export class BattleEndedError extends Error {
  constructor() {
    super("Battle ended before next intent phase");
  }
}

export async function waitForPhase(
  phase: "intent" | "resolve",
  timeoutMs = 30000,
): Promise<void> {
  const page = await getPage();
  const result = await page.waitForFunction(
    (p) => {
      const phaseLabel = document
        .querySelector("#phase-label")
        ?.textContent?.trim();
      if (phaseLabel === p) return "phase";
      if (phaseLabel === "ended") return "ended";
      return null;
    },
    phase,
    { timeout: timeoutMs },
  );
  const value = await result.jsonValue();
  if (value === "ended") throw new BattleEndedError();
  console.log(`[phase] ${phase}`);
}

// Navigates back to the hunt page without completing the battle.
export async function abortHunt(): Promise<void> {
  const page = await getPage();
  const origin = new URL(page.url()).origin;
  await page.goto(`${origin}/app/hunt`);
  await page.waitForSelector(".hunt-start", { timeout: 30000 });
  console.log("[abort] navigated back to hunt page");
}

// Waits for the hunt page, clicks Start Hunt, then waits for the battle page to load.
export async function startHunt(baitNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7): Promise<void> {
  const page = await getPage();
  await page.waitForSelector(".hunt-start", { timeout: 30000 });
  await page
    .locator(".hunt-start")
    .nth(baitNumber - 1)
    .click();
  console.log(`[click] Start Hunt (bait ${baitNumber})`);
  // Wait up to 10s for the battle board to render; refresh once if slow, then error.
  try {
    await page.waitForSelector("#board .combatant.team-a", { timeout: 10000 });
  } catch {
    console.log('[nav] battle page slow to load — refreshing');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector("#board .combatant.team-a", { timeout: 10000 });
  }
}

// Clicks the "Return to Town" link shown after a battle ends (win or loss).
export async function clickReturnButton(): Promise<void> {
  const page = await getPage();
  try {
    await page.waitForSelector(".battle-again-btn", { timeout: 5000 });
    await page.click(".battle-again-btn");
    console.log("[click] Return to Town");
  } catch {
    console.log("[click] return button not found — may already be gone");
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { logFile } from './logger.js';
import { CONFIG } from './config.js';
import { getPage } from './browser.js';
import { isBattleOver, readTotalEnemyHp, readGameState, readBattleResult, readPlayerHp } from './gameReader.js';
import { executeTurn, BattleEndedError } from './dynamicTurn.js';
import { startHunt, abortHunt, clickReturnButton, sleep } from './actions.js';
import { resetBattleState, type TurnType } from './strategy.js';

const numericArgs = process.argv.slice(2).filter((a) => /^\d+$/.test(a));
const loops = numericArgs[0] !== undefined ? parseInt(numericArgs[0], 10) : CONFIG.loops;

async function currentPath(): Promise<string> {
  const page = await getPage();
  return new URL(page.url()).pathname;
}

async function runLoop(): Promise<void> {
  console.log(`Autoclicker started — ${loops} loop(s). Ctrl+C to stop.`);
  console.log(`Logging to: ${logFile}\n`);

  const startTime = Date.now();

  for (let loop = 0; loop < loops; loop++) {
    console.log(`--- Loop ${loop + 1} / ${loops} ---`);
    resetBattleState();
    try {

    const path = await currentPath();

    if (path.startsWith('/battle')) {
      console.log('[nav] already in battle — skipping start hunt');
      // Verify the board is actually usable; dead/results pages keep the /battle URL
      const page = await getPage();
      try {
        await page.waitForSelector('#board .combatant.team-a', { timeout: 3000 });
      } catch {
        console.log('[nav] board not ready on battle URL — navigating to hunt');
        await abortHunt();
        await sleep(CONFIG.idleWaitMs);
        await startHunt(CONFIG.baitNumber);
        await sleep(CONFIG.idleWaitMs);
      }
    } else {
      // On hunt page (or anywhere else): start a new hunt
      await startHunt(CONFIG.baitNumber);
      await sleep(CONFIG.idleWaitMs);
    }

    // For multiple enemies, abort if total HP exceeds 2× our damage per attack.
    // Single enemy: always proceed regardless of HP.
    const board = await readGameState();
    const startEnemies = board.enemies.map(e => `${e.name}=(${e.col},${e.row})`).join(' ');
    const startTrees = board.trees.map(t => `(${t.col},${t.row})`).join(' ');
    console.log(`[battle] start — player=(${board.player.col},${board.player.row}) enemies: ${startEnemies}`);
    console.log(`[battle] trees (${board.trees.length}): ${startTrees || 'none'}`);

    if (board.enemies.length > 1) {
      const totalHp = await readTotalEnemyHp();
      const hpThreshold = 2 * CONFIG.damagePerAttack;
      if (totalHp > hpThreshold) {
        console.log(`[battle] ${board.enemies.length} enemies, total HP ${totalHp} exceeds threshold ${hpThreshold} — aborting`);
        await abortHunt();
        await sleep(CONFIG.idleWaitMs);
        continue;
      }
      console.log(`[battle] ${board.enemies.length} enemies, total HP ${totalHp} within threshold ${hpThreshold} — proceeding`);
    } else {
      console.log(`[battle] single enemy — proceeding regardless of HP`);
    }

    const isLastLoop = loop === loops - 1;
    let turnType: TurnType = 'attack';
    let gameTurn = 0;

    // Read max HP once at battle start — used to detect any damage taken.
    const { max: maxHp } = await readPlayerHp();

    while (true) {
      if (await isBattleOver()) {
        const result = await readBattleResult();
        console.log(`[battle] battle over — result: ${result}`);
        if (!isLastLoop && !CONFIG.skipReturn) {
          await clickReturnButton();
        }
        break;
      }

      // Abort as soon as the player has taken any damage.
      if (maxHp > 0) {
        const { current: currentHp } = await readPlayerHp();
        if (currentHp < maxHp) {
          console.log(`[battle] player HP dropped to ${currentHp}/${maxHp} — aborting`);
          await abortHunt();
          break;
        }
      }

      gameTurn++;
      console.log(`\n[battle] game turn ${gameTurn} — ${turnType}`);

      try {
        await executeTurn(turnType, CONFIG.idleWaitMs);
      } catch (err) {
        if (err instanceof BattleEndedError) {
          const result = await readBattleResult();
          console.log(`[battle] battle ended mid-turn — result: ${result}`);
          if (!isLastLoop && !CONFIG.skipReturn) {
            await clickReturnButton();
          }
          break;
        }
        throw err;
      }

      turnType = turnType === 'attack' ? 'recover' : 'attack';
      await sleep(CONFIG.idleWaitMs);
    }

    } catch (err) {
      console.error(`[loop] error in loop ${loop + 1} — restarting:`, err);
      // If still on the battle URL after an error, navigate away so the next loop starts clean
      try {
        const errPath = await currentPath();
        if (errPath.startsWith('/battle')) {
          await abortHunt();
        }
      } catch {
        // ignore nav errors during recovery
      }
    }

    await sleep(1000);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone — ${elapsed}s total.`);
}

runLoop().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

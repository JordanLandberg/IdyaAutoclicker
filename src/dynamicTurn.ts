import { readGameState, getValidTargets } from './gameReader.js';
import { chooseMoveAndTarget, reportAttackFailed, reportAttackSucceeded, type TurnType } from './strategy.js';
import { clickCell, clickAction, clickSubmitIntent, waitForPhase, BattleEndedError, sleep, isActionEnabled } from './actions.js';
import type { Pos } from './grid.js';
import { posEq } from './grid.js';

export { BattleEndedError };

export async function executeTurn(turnType: TurnType, idleWaitMs: number): Promise<void> {
  await waitForPhase('intent');

  const board = await readGameState();
  const enemyList = board.enemies.map(e => `${e.name}=(${e.col},${e.row})`).join(' ');
  console.log(`[turn] player=(${board.player.col},${board.player.row}) ${enemyList} trees=${board.trees.length}`);

  const decision = chooseMoveAndTarget(board, turnType);

  // 1. Select player's current cell
  await clickCell(board.player);
  await sleep(idleWaitMs);

  // 2. Click destination (move)
  await clickCell(decision.playerMove);
  await sleep(idleWaitMs);

  // 3. Choose action and target
  if (decision.action === 'empty-self') {
    const canAttack = await isActionEnabled('Empty Self');
    if (!canAttack) {
      console.log('[turn] Empty Self not available (insufficient resources) — using Fill Self');
      reportAttackFailed();
      await clickAction('Fill Self');
      await sleep(idleWaitMs);
      await clickSubmitIntent();
      await sleep(idleWaitMs);
      return;
    }
    await clickAction('Empty Self');
    await sleep(idleWaitMs);

    // The game's target-valid cells are the authority on what can actually be attacked
    // from the chosen destination. Strategy provides a predicted target as a hint.
    const validTargets = await getValidTargets();

    // Priority 1: strategy's predicted enemy position
    // Priority 2: any current enemy cell that the game says is attackable
    let chosenTarget: Pos | null = null;
    if (decision.attackTarget && validTargets.some(t => posEq(t, decision.attackTarget!))) {
      chosenTarget = decision.attackTarget;
    } else {
      const found = board.enemies.find(e => validTargets.some(t => posEq(t, e)));
      if (found) {
        console.log(`[turn] predicted target not in target-valid — found enemy at (${found.col},${found.row})`);
        chosenTarget = found;
      }
    }

    if (chosenTarget) {
      reportAttackSucceeded();
      await clickCell(chosenTarget);
      await sleep(idleWaitMs);
    } else {
      console.log(`[turn] no enemy in target-valid cells — falling back to Fill Self`);
      reportAttackFailed();
      await clickAction('← Back');
      await sleep(idleWaitMs);
      await clickAction('Fill Self');
      await sleep(idleWaitMs);
    }
  } else {
    await clickAction('Fill Self');
    await sleep(idleWaitMs);
  }

  // 4. Submit intent
  await clickSubmitIntent();
  await sleep(idleWaitMs);
}

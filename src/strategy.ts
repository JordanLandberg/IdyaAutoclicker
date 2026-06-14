import { type Pos, manhattan, chebyshev, posEq, inBounds, GRID_COLS, GRID_ROWS } from './grid.js';
import { type GameBoard, type Enemy } from './gameReader.js';
import { getValidMoves, predictEnemyMove, hasLineOfSight } from './movement.js';

export type TurnType = 'attack' | 'recover';

export interface Decision {
  playerMove: Pos;
  attackTarget: Pos | null;
  action: 'empty-self' | 'fill-self';
}

const MIN_ATTACK_DIST = 3;
const STUCK_THRESHOLD = 2;

let consecutiveNoLos = 0;
let stuckCycles = 0;                    // how many times the stuck handler has fired this battle
let focusTargetName: string | null = null;
let lastCornerIdx: number | null = null; // anti-oscillation: never go back to where we just were
let orbitNoAttackTurns = 0;             // give up orbit after this many turns with no attack
const ORBIT_GIVE_UP = 4;
let lockedKitingTree: Pos | null = null; // locked tree — don't switch mid-orbit
let turnCounter = 0;
const excludedTrees = new Map<string, number>(); // treeKey → expiry turn
const TREE_EXCLUDE_TURNS = 5;

function treeKey(t: Pos): string { return `${t.col},${t.row}`; }
function excludeTree(t: Pos): void { excludedTrees.set(treeKey(t), turnCounter + TREE_EXCLUDE_TURNS); }
function isExcluded(t: Pos): boolean {
  const expiry = excludedTrees.get(treeKey(t));
  return expiry !== undefined && turnCounter < expiry;
}

// Returns the focus target enemy, picking the closest one if none is set.
// Clears focus if that enemy is no longer on the board.
function resolveFocusTarget(enemies: Enemy[], player: Pos): Enemy {
  if (focusTargetName) {
    const found = enemies.find(e => e.name === focusTargetName);
    if (found) return found;
    // Focus target is dead — pick a new one
    console.log(`[strategy] focus target "${focusTargetName}" is gone — switching`);
    focusTargetName = null;
  }
  // Pick the closest enemy as the new focus target
  const target = enemies.reduce((closest, e) =>
    manhattan(e, player) < manhattan(closest, player) ? e : closest
  );
  focusTargetName = target.name;
  console.log(`[strategy] focus target set to "${focusTargetName}"`);
  return target;
}

export function resetBattleState(): void {
  consecutiveNoLos = 0;
  stuckCycles = 0;
  focusTargetName = null;
  lastCornerIdx = null;
  orbitNoAttackTurns = 0;
  lockedKitingTree = null;
  turnCounter = 0;
  excludedTrees.clear();
}

export function reportAttackFailed(): void {
  consecutiveNoLos++;
  if (lockedKitingTree) orbitNoAttackTurns++;
  console.log(`[strategy] attack validated as invalid by game — consecutive failures: ${consecutiveNoLos}`);
}

export function reportAttackSucceeded(): void {
  consecutiveNoLos = 0;
  stuckCycles = 0;
  orbitNoAttackTurns = 0;
}

// ─── Orbit constants ───────────────────────────────────────────────────────────
// Corners in clockwise order (offsets relative to tree)
// Index: 0=top-left(1), 1=top-right(3), 2=bottom-right(9), 3=bottom-left(7)
const CORNER_OFFSETS = [
  { dc: -1, dr: -1 }, // 0: top-left
  { dc: +1, dr: -1 }, // 1: top-right
  { dc: +1, dr: +1 }, // 2: bottom-right
  { dc: -1, dr: +1 }, // 3: bottom-left
];

// Edge offsets relative to tree
const EDGE_OFFSET: Record<string, { dc: number; dr: number }> = {
  top:    { dc:  0, dr: -1 },
  right:  { dc: +1, dr:  0 },
  bottom: { dc:  0, dr: +1 },
  left:   { dc: -1, dr:  0 },
};

// Each corner's two adjacent edges
const CORNER_EDGES: [string, string][] = [
  ['top',   'left'  ], // corner 0 (top-left)
  ['top',   'right' ], // corner 1 (top-right)
  ['right', 'bottom'], // corner 2 (bottom-right)
  ['left',  'bottom'], // corner 3 (bottom-left)
];

function cornerPos(tree: Pos, idx: number): Pos {
  return { col: tree.col + CORNER_OFFSETS[idx].dc, row: tree.row + CORNER_OFFSETS[idx].dr };
}

function edgePos(tree: Pos, edgeName: string): Pos {
  const e = EDGE_OFFSET[edgeName];
  return { col: tree.col + e.dc, row: tree.row + e.dr };
}

// Next corner index: prefer the direction that moves farther from the enemy,
// but never return to the corner we just came from (anti-oscillation).
function nextCornerIdx(currentIdx: number, enemy: Pos, tree: Pos): number {
  const cw  = (currentIdx + 1) % 4;
  const ccw = (currentIdx + 3) % 4;

  // If one direction would go back to where we just were, force the other direction
  if (lastCornerIdx !== null) {
    if (cw  === lastCornerIdx) return ccw;
    if (ccw === lastCornerIdx) return cw;
  }

  return chebyshev(cornerPos(tree, cw), enemy) >= chebyshev(cornerPos(tree, ccw), enemy) ? cw : ccw;
}

// ─── Main entry point ──────────────────────────────────────────────────────────
export function chooseMoveAndTarget(board: GameBoard, turnType: TurnType): Decision {
  turnCounter++;
  const { player, enemies, trees } = board;

  // Focus fire: lock onto one enemy until dead, then pick the next closest
  const focusEnemy = resolveFocusTarget(enemies, player);

  const validMoves = getValidMoves(player, trees, enemies);
  const candidates = [player, ...validMoves];

  // Predict all enemies moving; use focus enemy's predicted position as the attack target
  const enemiesAfter = enemies.map(e => predictEnemyMove(e, player, trees));
  const focusEnemyAfter = predictEnemyMove(focusEnemy, player, trees);

  // For safety scoring use the closest predicted enemy (any of them)
  const enemyAfter = enemiesAfter.reduce((closest, e) =>
    manhattan(e, player) < manhattan(closest, player) ? e : closest
  );

  // If the orbit gave up, release the locked tree and use fallback
  if (orbitNoAttackTurns >= ORBIT_GIVE_UP) {
    if (lockedKitingTree) {
      excludeTree(lockedKitingTree);
      console.log(`[strategy] orbit gave up after ${orbitNoAttackTurns} turns — releasing tree (${lockedKitingTree.col},${lockedKitingTree.row})`);
      lockedKitingTree = null;
      lastCornerIdx = null;
      consecutiveNoLos = 0;
    }
    return chooseFallbackMove(board, focusEnemy, focusEnemyAfter, enemyAfter, turnType, candidates);
  }

  // Lock onto a tree when we don't have one yet; keep it once chosen
  if (!lockedKitingTree) {
    lockedKitingTree = findKitingTree(trees, player, focusEnemy);
  }

  if (lockedKitingTree) {
    return chooseOrbitMove(board, focusEnemy, focusEnemyAfter, enemyAfter, turnType, lockedKitingTree, candidates);
  }

  return chooseFallbackMove(board, focusEnemy, focusEnemyAfter, enemyAfter, turnType, candidates);
}

// ─── Orbit strategy ────────────────────────────────────────────────────────────
function chooseOrbitMove(
  board: GameBoard,
  focusEnemy: Pos,
  focusEnemyAfter: Pos,
  safetyEnemyAfter: Pos,
  turnType: TurnType,
  tree: Pos,
  candidates: Pos[],
): Decision {
  const { player, trees } = board;
  const allCorners = CORNER_OFFSETS.map((_, i) => cornerPos(tree, i));

  // Which corner is the player currently on?
  const currentIdx = allCorners.findIndex(c => posEq(c, player));

  if (currentIdx === -1) {
    // Not at a corner yet — on attack turns, try to fire before committing to approach
    if (turnType === 'attack') {
      // Enemy chases the player's destination, not origin — predict per candidate move
      const attackMoves = candidates.map(m => ({ move: m, target: predictEnemyMove(focusEnemy, m, trees) }));
      const withDist = attackMoves.filter(
        ({ move, target }) => hasLineOfSight(move, target, trees) && manhattan(move, target) >= MIN_ATTACK_DIST
      );
      const attackPool = withDist.length > 0
        ? withDist
        : attackMoves.filter(({ move, target }) => hasLineOfSight(move, target, trees) && chebyshev(move, target) >= 2);
      if (attackPool.length > 0) {
        // Bias toward positions close to the orbit tree so we don't drift away during approach
        attackPool.sort((a, b) => {
          const scoreA = fallbackScore(a.move, safetyEnemyAfter, a.target, trees) - manhattan(a.move, tree) * 50;
          const scoreB = fallbackScore(b.move, safetyEnemyAfter, b.target, trees) - manhattan(b.move, tree) * 50;
          return scoreB - scoreA;
        });
        const best = attackPool[0];
        console.log(`[strategy] opportunistic attack (approaching tree): move (${best.move.col},${best.move.row}), target (${best.target.col},${best.target.row})`);
        return { playerMove: best.move, attackTarget: best.target, action: 'empty-self' };
      }
    }

    // Move toward the best reachable corner, or step toward the tree
    const reachable = allCorners.filter(c => candidates.some(cand => posEq(cand, c)));
    if (reachable.length > 0) {
      // Prefer corners where the enemy is not currently adjacent (chebyshev > 1)
      const notAdjacent = reachable.filter(c => chebyshev(c, focusEnemy) > 1);
      const cornerPool = notAdjacent.length > 0 ? notAdjacent : reachable;
      const target = cornerPool.reduce((best, c) => {
        // Prefer corners where the enemy won't be adjacent after their next move (two-step safety).
        // Step 1: enemy chases the corner (our destination this turn).
        // Step 2: enemy chases the corner again (we're now there).
        const step1C       = predictEnemyMove(focusEnemy, c,    trees);
        const twoStepC     = predictEnemyMove(step1C,     c,    trees);
        const step1Best    = predictEnemyMove(focusEnemy, best, trees);
        const twoStepBest  = predictEnemyMove(step1Best,  best, trees);
        const distC    = chebyshev(twoStepC,    c);
        const distBest = chebyshev(twoStepBest, best);
        if (distC !== distBest) return distC > distBest ? c : best;
        // Tie-break: prefer corner farther from current enemy position
        const currDistC    = chebyshev(c, focusEnemy);
        const currDistBest = chebyshev(best, focusEnemy);
        if (currDistC !== currDistBest) return currDistC > currDistBest ? c : best;
        return manhattan(c, safetyEnemyAfter) > manhattan(best, safetyEnemyAfter) ? c : best;
      });
      // If even the best corner will have the enemy adjacent after two steps, it's a trap —
      // abandon the orbit tree and retreat rather than walk into a dangerous position.
      const targetStep1 = predictEnemyMove(focusEnemy, target, trees);
      const twoStep     = predictEnemyMove(targetStep1, target, trees);
      if (chebyshev(twoStep, target) <= 1) {
        excludeTree(tree);
        lockedKitingTree = null;
        lastCornerIdx = null;
        const safest = bestRetreat(candidates, focusEnemy, safetyEnemyAfter, trees);
        console.log(`[strategy] orbit approach: all corners two-step unsafe — abandoning tree (${tree.col},${tree.row}), retreating to (${safest.col},${safest.row})`);
        return { playerMove: safest, attackTarget: null, action: 'fill-self' };
      }
      console.log(`[strategy] approaching orbit corner (${target.col},${target.row}) of tree (${tree.col},${tree.row})`);
      return { playerMove: target, attackTarget: null, action: 'fill-self' };
    }
    const safeSteps = candidates.filter(c => chebyshev(c, focusEnemyAfter) > 1);
    const stepsPool = safeSteps.length > 0 ? safeSteps : candidates;
    const step = stepsPool.reduce((best, c) =>
      manhattan(c, tree) < manhattan(best, tree) ? c : best
    );
    console.log(`[strategy] stepping toward kiting tree (${tree.col},${tree.row})`);
    return { playerMove: step, attackTarget: null, action: 'fill-self' };
  }

  // At a corner — pick next corner (anti-oscillation enforced in nextCornerIdx)
  const next = nextCornerIdx(currentIdx, safetyEnemyAfter, tree);
  const nextPos = cornerPos(tree, next);
  const canReach = candidates.some(c => posEq(c, nextPos));
  const moveTarget = canReach ? nextPos : player;

  if (turnType === 'attack') {
    // Advance to next corner if the enemy will be adjacent (chebyshev ≤ 1) OR if the enemy
    // has a direct line of sight to our current corner — they can counterattack from there.
    // Otherwise stay and let the game's target-valid cells confirm whether we can fire.
    const shouldAdvance = chebyshev(player, focusEnemyAfter) <= 1
      || hasLineOfSight(focusEnemyAfter, player, trees);
    lastCornerIdx = currentIdx;

    let stayPos: Pos;
    let stayLabel: string;
    if (!shouldAdvance) {
      stayPos = player;
      stayLabel = `stay corner ${currentIdx}`;
    } else {
      // Need to advance — primary choice is the calculated next corner, but only if it's safe.
      // Safety must be checked against the enemy chasing the DESTINATION (nextPos), not the
      // current player position — the enemy always chases where the player moves to.
      const enemyAtNext = predictEnemyMove(focusEnemy, nextPos, trees);
      const primarySafe = canReach && chebyshev(nextPos, enemyAtNext) > 1;
      if (primarySafe) {
        stayPos = nextPos;
        stayLabel = `advance to corner ${next}`;
      } else {
        // Primary corner is blocked or would still be adjacent — reverse orbit direction
        const cwIdx   = (currentIdx + 1) % 4;
        const ccwIdx  = (currentIdx + 3) % 4;
        const revIdx  = next === cwIdx ? ccwIdx : cwIdx;
        const revPos  = cornerPos(tree, revIdx);
        const enemyAtRev = predictEnemyMove(focusEnemy, revPos, trees);
        const revOk   = candidates.some(c => posEq(c, revPos)) && chebyshev(revPos, enemyAtRev) > 1;
        if (revOk) {
          stayPos = revPos;
          stayLabel = `reverse to corner ${revIdx}`;
        } else {
          // Both directions unsafe — find any safe non-adjacent candidate near tree,
          // predicting enemy per-destination since each move changes the enemy's target.
          const safePool = candidates.filter(c => chebyshev(c, predictEnemyMove(focusEnemy, c, trees)) > 1);
          stayPos = safePool.length > 0
            ? safePool.reduce((best, c) => manhattan(c, tree) < manhattan(best, tree) ? c : best)
            : player;
          stayLabel = `safety move to (${stayPos.col},${stayPos.row})`;
        }
      }
    }
    // Verify LOS from the chosen attack position to the predicted target — the orbit corner
    // geometry assumes clear diagonals but trees can block them.
    // Re-predict enemy using stayPos as destination (enemy chases player's destination, not origin).
    const stayTarget = predictEnemyMove(focusEnemy, stayPos, trees);
    if (!hasLineOfSight(stayPos, stayTarget, trees) || chebyshev(stayPos, stayTarget) <= 1) {
      // Primary choice blocked — search the full candidate pool for a safe position with LOS.
      const losPool = candidates
        .map(c => ({ pos: c, target: predictEnemyMove(focusEnemy, c, trees) }))
        .filter(({ pos, target }) => chebyshev(pos, target) > 1 && hasLineOfSight(pos, target, trees));
      if (losPool.length > 0) {
        // Prefer orbit corners so the player stays on-corner after the attack.
        const cornersWithLos = losPool.filter(({ pos }) => allCorners.some(cp => posEq(cp, pos)));
        const pickFrom = cornersWithLos.length > 0 ? cornersWithLos : losPool;
        const best = pickFrom.reduce((b, c) => manhattan(c.pos, tree) < manhattan(b.pos, tree) ? c : b);
        console.log(`[strategy] orbit attack (${stayLabel}): rerouted to (${best.pos.col},${best.pos.row}) for LOS to (${best.target.col},${best.target.row})`);
        return { playerMove: best.pos, attackTarget: best.target, action: 'empty-self' };
      }
      // No safe position with LOS — fill and let orbit give up rather than risk an
      // adjacent attack that exposes the player to a counterattack.
      orbitNoAttackTurns++;
      console.log(`[strategy] orbit attack (${stayLabel}): no safe LOS to (${stayTarget.col},${stayTarget.row}) — fill instead`);
      return { playerMove: stayPos, attackTarget: null, action: 'fill-self' };
    }
    console.log(`[strategy] orbit attack (${stayLabel}): move (${stayPos.col},${stayPos.row}), target (${stayTarget.col},${stayTarget.row})`);
    return { playerMove: stayPos, attackTarget: stayTarget, action: 'empty-self' };
  }

  // Recover turn — advance to next corner, but avoid corners the enemy can step adjacent to
  // Two-step check: predict where enemy moves when heading toward our chosen corner
  let safeNext = next;
  let safeMoveTarget = moveTarget;
  if (canReach) {
    const step1Next    = predictEnemyMove(focusEnemy, nextPos, trees);
    const twoStepEnemy = predictEnemyMove(step1Next,  nextPos, trees);
    if (chebyshev(twoStepEnemy, nextPos) <= 1) {
      const cwIdx  = (currentIdx + 1) % 4;
      const ccwIdx = (currentIdx + 3) % 4;
      const altIdx = safeNext === cwIdx ? ccwIdx : cwIdx;
      if (altIdx !== lastCornerIdx) {
        const altPos    = cornerPos(tree, altIdx);
        if (candidates.some(c => posEq(c, altPos))) {
          const altStep1   = predictEnemyMove(focusEnemy, altPos, trees);
          const altTwoStep = predictEnemyMove(altStep1,   altPos, trees);
          if (chebyshev(altTwoStep, altPos) > chebyshev(twoStepEnemy, nextPos)) {
            console.log(`[strategy] orbit recover: rerouted to corner ${altIdx} — enemy would be adjacent at corner ${next}`);
            safeNext = altIdx;
            safeMoveTarget = altPos;
          }
        }
      }
    }
  } else {
    // Target corner is blocked (enemy standing on it) — find another reachable corner
    // rather than staying put adjacent to the enemy.
    const altIdx = ([0, 1, 2, 3] as const)
      .filter(i => i !== safeNext && i !== currentIdx && candidates.some(c => posEq(c, cornerPos(tree, i))))
      .reduce<number | null>((best, i) => {
        if (best === null) return i;
        const posI       = cornerPos(tree, i);
        const posBest    = cornerPos(tree, best);
        const step1I     = predictEnemyMove(focusEnemy, posI,    trees);
        const twoI       = predictEnemyMove(step1I,     posI,    trees);
        const step1Best  = predictEnemyMove(focusEnemy, posBest, trees);
        const twoBest    = predictEnemyMove(step1Best,  posBest, trees);
        return chebyshev(twoI, posI) >= chebyshev(twoBest, posBest) ? i : best;
      }, null);

    if (altIdx !== null) {
      safeNext = altIdx;
      safeMoveTarget = cornerPos(tree, altIdx);
      console.log(`[strategy] orbit recover: corner ${next} blocked — rerouting to corner ${safeNext} (${safeMoveTarget.col},${safeMoveTarget.row})`);
    } else {
      // No corner reachable — abandon orbit and use best retreat
      excludeTree(tree);
      lockedKitingTree = null;
      lastCornerIdx = null;
      const retreat = bestRetreat(candidates, focusEnemy, safetyEnemyAfter, trees);
      console.log(`[strategy] orbit recover: all corners blocked — abandoning tree, retreating to (${retreat.col},${retreat.row})`);
      return { playerMove: retreat, attackTarget: null, action: 'fill-self' };
    }
  }
  lastCornerIdx = currentIdx;
  console.log(`[strategy] orbit recover: move to corner ${safeNext} (${safeMoveTarget.col},${safeMoveTarget.row})`);
  return { playerMove: safeMoveTarget, attackTarget: null, action: 'fill-self' };
}

// ─── Fallback strategy (no isolated tree) ──────────────────────────────────────
function chooseFallbackMove(
  board: GameBoard,
  enemy: Pos,
  focusEnemyAfter: Pos,
  safetyEnemyAfter: Pos,
  turnType: TurnType,
  candidates: Pos[],
): Decision {
  const enemyAfter = focusEnemyAfter;
  const { player, trees } = board;

  if (turnType === 'attack') {
    if (consecutiveNoLos >= STUCK_THRESHOLD) {
      stuckCycles++;
      consecutiveNoLos = 1;
      const approach = bestApproach(candidates, enemy, trees);
      const approachTarget = predictEnemyMove(enemy, approach, trees);
      if (hasLineOfSight(approach, approachTarget, trees) && chebyshev(approach, approachTarget) >= 2) {
        console.log(`[strategy] stuck ${stuckCycles} cycle(s) — approaching (${approach.col},${approach.row}) with attack on (${approachTarget.col},${approachTarget.row})`);
        return { playerMove: approach, attackTarget: approachTarget, action: 'empty-self' };
      }
      console.log(`[strategy] stuck ${stuckCycles} cycle(s) — approaching (${approach.col},${approach.row}) to find LOS`);
      return { playerMove: approach, attackTarget: null, action: 'fill-self' };
    }

    // Enemy chases the player's destination, not origin — predict per candidate move
    const attackMoves = candidates.map(m => ({ move: m, target: predictEnemyMove(enemy, m, trees) }));
    const withDist = attackMoves.filter(
      ({ move, target }) => hasLineOfSight(move, target, trees) && manhattan(move, target) >= MIN_ATTACK_DIST
    );
    // Relax to chebyshev>=2 if no positions meet MIN_ATTACK_DIST — never attack from adjacent (chebyshev=1)
    const withMinDist = withDist.length > 0
      ? withDist
      : attackMoves.filter(({ move, target }) => hasLineOfSight(move, target, trees) && chebyshev(move, target) >= 2);
    const rawPool = withMinDist.length > 0
      ? withMinDist
      : attackMoves.filter(({ move, target }) => hasLineOfSight(move, target, trees));
    // Hard-filter grid-edge cells — the scoring penalty isn't always strong enough
    const pool = (() => {
      const interior = rawPool.filter(({ move }) => !isEdgeCell(move));
      return interior.length > 0 ? interior : rawPool;
    })();

    if (pool.length > 0) {
      pool.sort((a, b) => fallbackScore(b.move, enemy, b.target, trees) - fallbackScore(a.move, enemy, a.target, trees));
      const best = pool[0];
      console.log(`[strategy] attack: move to (${best.move.col},${best.move.row}), target (${best.target.col},${best.target.row}), dist=${manhattan(best.move, best.target)}`);
      return { playerMove: best.move, attackTarget: best.target, action: 'empty-self' };
    }

    consecutiveNoLos++;
    console.log('[strategy] no LOS found for attack, approaching for LOS');
    // Move toward enemy (not away) — retreating only increases range and worsens LOS next turn
    const notAdjacent = candidates.filter(c => chebyshev(c, safetyEnemyAfter) > 1);
    const approachPool = notAdjacent.length > 0 ? notAdjacent : candidates;
    const approachMove = approachPool.reduce((best, c) =>
      manhattan(c, enemy) < manhattan(best, enemy) ? c : best
    );
    return { playerMove: approachMove, attackTarget: null, action: 'fill-self' };
  }

  if (stuckCycles >= 2) {
    const approach = bestApproach(candidates, enemy, trees);
    console.log(`[strategy] stuck ${stuckCycles} cycles — forcing approach on recover to (${approach.col},${approach.row})`);
    return { playerMove: approach, attackTarget: null, action: 'fill-self' };
  }
  const safest = bestRetreat(candidates, enemy, safetyEnemyAfter, trees);
  console.log(`[strategy] recover: move to (${safest.col},${safest.row})`);
  return { playerMove: safest, attackTarget: null, action: 'fill-self' };
}

// ─── Tree selection ────────────────────────────────────────────────────────────
function findKitingTree(trees: Pos[], player: Pos, enemy: Pos): Pos | null {
  const isolated = trees.filter(tree => {
    if (isExcluded(tree)) return false;
    // All in-bounds neighbours must not be trees (OOB cells can never hold trees)
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const n: Pos = { col: tree.col + dc, row: tree.row + dr };
        if (!inBounds(n)) continue;
        if (trees.some(t => posEq(t, n))) return false;
      }
    }
    // Require at least 2 non-edge corners — trees near the grid boundary produce
    // corner traps with no escape routes.
    const usableCorners = CORNER_OFFSETS.filter((_, i) => !isEdgeCell(cornerPos(tree, i)));
    return usableCorners.length >= 2;
  });

  if (isolated.length === 0) return null;

  // Prefer trees no farther from the player than from the enemy using chebyshev distance,
  // which matches the game's diagonal-movement model (ceil(chebyshev/2) turns to arrive).
  const safe = isolated.filter(t => chebyshev(t, player) <= chebyshev(t, enemy));
  if (safe.length === 0) return null;
  return safe.reduce((best, t) => {
    const dT = manhattan(t, player);
    const dB = manhattan(best, player);
    if (dT !== dB) return dT < dB ? t : best;
    // Equal distance — prefer trees whose corners are currently farther from the enemy
    // (fewer corners threatened means fewer two-step-unsafe abandons later)
    const safeT = CORNER_OFFSETS.filter((_, i) => chebyshev(cornerPos(t,    i), enemy) > 2).length;
    const safeB = CORNER_OFFSETS.filter((_, i) => chebyshev(cornerPos(best, i), enemy) > 2).length;
    if (safeT !== safeB) return safeT > safeB ? t : best;
    return centralityScore(t) > centralityScore(best) ? t : best;
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

// Returns true for cells on or within 1 of the grid boundary — avoid these when retreating.
function isEdgeCell(pos: Pos): boolean {
  return pos.col <= 0 || pos.col >= GRID_COLS - 1 || pos.row <= 0 || pos.row >= GRID_ROWS - 1;
}

// Max distance benefit — beyond this, being further from the enemy adds nothing.
// Prevents the bot from running to the opposite corner just to maximise distance.
const MAX_USEFUL_DIST = 6;

// Score blends current enemy position and predicted position so the bot
// can't accidentally move closer to where the enemy actually is right now.
// Uses chebyshev (not manhattan) since the game uses 8-directional movement —
// two positions at the same chebyshev distance from the enemy are equally safe
// regardless of direction. Low weight (50) so centrality + mobility dominate
// when positions are equidistant, keeping the bot away from corners.
function fallbackScore(pos: Pos, currentEnemy: Pos, enemyAfter: Pos, trees: Pos[]): number {
  const edgePenalty = isEdgeCell(pos) ? -800 : 0;
  const distCurrent = Math.min(chebyshev(pos, currentEnemy), MAX_USEFUL_DIST);
  const distAfter   = Math.min(chebyshev(pos, enemyAfter),   MAX_USEFUL_DIST);
  return distCurrent * 50
    + distAfter * 50
    + centralityScore(pos) * 100
    + mobilityFrom(pos, trees, enemyAfter) * 10
    + edgePenalty;
}

function bestRetreat(candidates: Pos[], currentEnemy: Pos, enemyAfter: Pos, trees: Pos[]): Pos {
  // Prefer positions where the predicted enemy is not adjacent (chebyshev > 1)
  const safe = candidates.filter(c => chebyshev(c, enemyAfter) > 1);
  const pool = safe.length > 0 ? safe : candidates;
  return pool.reduce((best, m) =>
    fallbackScore(m, currentEnemy, enemyAfter, trees) > fallbackScore(best, currentEnemy, enemyAfter, trees) ? m : best
  );
}

function bestApproach(candidates: Pos[], enemy: Pos, trees: Pos[]): Pos {
  return candidates.reduce((best, m) => {
    if (manhattan(m, enemy) !== manhattan(best, enemy))
      return manhattan(m, enemy) < manhattan(best, enemy) ? m : best;
    return mobilityFrom(m, trees, enemy) > mobilityFrom(best, trees, enemy) ? m : best;
  });
}

function centralityScore(pos: Pos): number {
  const cx = (GRID_COLS - 1) / 2;
  const cy = (GRID_ROWS - 1) / 2;
  const maxDist = Math.max(cx, cy);
  const dist = Math.max(Math.abs(pos.col - cx), Math.abs(pos.row - cy));
  return Math.round((1 - dist / maxDist) * 10);
}

function mobilityFrom(pos: Pos, trees: Pos[], enemy: Pos): number {
  return getValidMoves(pos, trees, [enemy]).length;
}


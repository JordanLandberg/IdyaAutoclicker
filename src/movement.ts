import { type Pos, inBounds, posEq, manhattan, chebyshev } from './grid.js';

// Returns all cells the player/enemy can legally move to from `from`.
// Movement rules: Chebyshev distance ≤ 2, but NOT pure 2-step diagonals (|Δcol|=2 AND |Δrow|=2).
export function getValidMoves(from: Pos, trees: Pos[], occupied: Pos[] = []): Pos[] {
  const moves: Pos[] = [];
  for (let dc = -2; dc <= 2; dc++) {
    for (let dr = -2; dr <= 2; dr++) {
      if (dc === 0 && dr === 0) continue;
      if (Math.abs(dc) === 2 && Math.abs(dr) === 2) continue; // no pure 2-diagonals

      const dest: Pos = { col: from.col + dc, row: from.row + dr };
      if (!inBounds(dest)) continue;
      if (trees.some(t => posEq(t, dest))) continue;
      if (occupied.some(o => posEq(o, dest))) continue;
      if (!canReach(from, dest, trees)) continue;
      moves.push(dest);
    }
  }
  return moves;
}

// Checks that the path from `from` to `dest` is not blocked by trees.
//
// For cardinal moves: the single intermediate cell must be clear.
// For L-shaped moves (|dc|=2,|dr|=1 or |dc|=1,|dr|=2): two possible routes exist.
//   The move is allowed if AT LEAST ONE route's intermediate is clear.
// For 1-step moves: no intermediate to check (diagonal squeeze still applies).
function canReach(from: Pos, dest: Pos, trees: Pos[]): boolean {
  const dc = dest.col - from.col;
  const dr = dest.row - from.row;
  const absDc = Math.abs(dc);
  const absDr = Math.abs(dr);
  const stepCol = dc === 0 ? 0 : Math.sign(dc);
  const stepRow = dr === 0 ? 0 : Math.sign(dr);

  const isTree = (p: Pos) => trees.some(t => posEq(t, p));

  // Single-step moves: only check diagonal squeeze
  if (absDc <= 1 && absDr <= 1) {
    if (absDc === 1 && absDr === 1) {
      const sideA: Pos = { col: from.col + stepCol, row: from.row };
      const sideB: Pos = { col: from.col, row: from.row + stepRow };
      if (isTree(sideA) && isTree(sideB)) return false;
    }
    return true;
  }

  // Cardinal 2-step moves: single intermediate must be clear
  if (absDr === 0 || absDc === 0) {
    const mid: Pos = { col: from.col + stepCol, row: from.row + stepRow };
    return !isTree(mid);
  }

  // L-shaped 2-step moves (|dc|=2,|dr|=1 or |dc|=1,|dr|=2):
  // The game routes through the larger component first (horizontal or vertical leg),
  // so only that intermediate cell needs to be clear. The diagonal intermediate is irrelevant.
  const viaLarge: Pos = absDc > absDr
    ? { col: from.col + stepCol, row: from.row }   // dc=2: horizontal leg first
    : { col: from.col, row: from.row + stepRow };   // dr=2: vertical leg first

  return !isTree(viaLarge);
}

// Simulates the enemy AI: finds the move that minimises Chebyshev distance to the player.
// Tiebreakers (in order):
//   1. Fewest squares moved from current position (Chebyshev distance from enemy)
//   2. Row-scan order (row ascending, col ascending within row)
// If staying in place ties for minimum distance, the enemy doesn't move.
export function predictEnemyMove(enemy: Pos, player: Pos, trees: Pos[]): Pos {
  const moves = getValidMoves(enemy, trees, [player]);

  const stayDist = chebyshev(enemy, player);

  let minDist = stayDist;
  for (const m of moves) {
    const d = chebyshev(m, player);
    if (d < minDist) minDist = d;
  }

  if (stayDist === minDist) return enemy;

  const candidates = moves.filter(m => chebyshev(m, player) === minDist);

  // Sort by: fewest squares moved from enemy (Chebyshev), then row, then col
  candidates.sort((a, b) => {
    const movedA = chebyshev(enemy, a);
    const movedB = chebyshev(enemy, b);
    if (movedA !== movedB) return movedA - movedB;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  return candidates[0];
}

// Returns true if `from` has an unobstructed line of sight to `to`.
// Supports all 8 directions; range limited to 4 squares (Chebyshev).
export function hasLineOfSight(from: Pos, to: Pos, trees: Pos[]): boolean {
  if (chebyshev(from, to) > 4) return false;

  const dc = to.col - from.col;
  const dr = to.row - from.row;

  // Must be a straight line in one of 8 directions
  if (dc !== 0 && dr !== 0 && Math.abs(dc) !== Math.abs(dr)) return false;

  const stepCol = dc === 0 ? 0 : Math.sign(dc);
  const stepRow = dr === 0 ? 0 : Math.sign(dr);
  const steps = Math.max(Math.abs(dc), Math.abs(dr));

  for (let i = 1; i < steps; i++) {
    const cell: Pos = { col: from.col + stepCol * i, row: from.row + stepRow * i };
    if (trees.some(t => posEq(t, cell))) return false;
  }

  return true;
}

export const GRID_COLS = 12;
export const GRID_ROWS = 10;

export interface Pos {
  col: number;
  row: number;
}

export function posEq(a: Pos, b: Pos): boolean {
  return a.col === b.col && a.row === b.row;
}

export function inBounds(p: Pos): boolean {
  return p.col >= 0 && p.col < GRID_COLS && p.row >= 0 && p.row < GRID_ROWS;
}

export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

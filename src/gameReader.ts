import { getPage } from './browser.js';
import type { Pos } from './grid.js';

export interface Enemy {
  name: string;
  col: number;
  row: number;
}

export interface GameBoard {
  player: Pos;
  enemies: Enemy[];
  trees: Pos[];
}

export async function readGameState(): Promise<GameBoard> {
  const page = await getPage();

  const state = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll('#board .cell'));
    let player: { col: number; row: number } | null = null;
    const enemies: { name: string; col: number; row: number }[] = [];
    const trees: { col: number; row: number }[] = [];

    for (const cell of cells) {
      const coord = (cell as HTMLElement).dataset.coord;
      if (!coord) continue;
      const [col, row] = coord.split(',').map(Number);

      if (cell.classList.contains('obstacle')) {
        trees.push({ col, row });
      } else if (cell.querySelector('.combatant.team-a')) {
        player = { col, row };
      } else {
        const enemyEl = cell.querySelector('.combatant.team-b');
        if (enemyEl) {
          const name = enemyEl.querySelector('.combatant-name')?.textContent?.trim() ?? 'Unknown';
          enemies.push({ name, col, row });
        }
      }
    }

    return { player, enemies, trees };
  });

  if (!state.player) throw new Error('Could not find player on the board');
  if (state.enemies.length === 0) throw new Error('Could not find any enemies on the board');

  return {
    player: state.player,
    enemies: state.enemies,
    trees: state.trees,
  };
}

// Returns the sum of all enemy max HP values at the start of a battle.
// Parses ".hp-text" elements like "110 / 110 HP" — takes the max (second number).
export async function readTotalEnemyHp(): Promise<number> {
  const page = await getPage();
  // Wait for combatant cards to be rendered before reading HP
  await page.waitForSelector('.combatant-card.team-b', { timeout: 10000 });
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.combatant-card.team-b'));
    return cards.reduce((total, card) => {
      const hpText = card.querySelector('.hp-text')?.textContent ?? '';
      const match = hpText.match(/\d+\s*\/\s*(\d+)/);
      return total + (match ? parseInt(match[1], 10) : 0);
    }, 0);
  });
}

export async function getValidTargets(): Promise<Pos[]> {
  const page = await getPage();
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('#board .cell.target-valid'))
      .map(el => {
        const [col, row] = (el as HTMLElement).dataset.coord!.split(',').map(Number);
        return { col, row };
      });
  });
}

export async function isBattleOver(): Promise<boolean> {
  const page = await getPage();
  return page.evaluate(() => {
    const phaseEnded = document.querySelector('#phase-label')?.textContent?.trim() === 'ended';
    const returnVisible = !!document.querySelector('.battle-again-btn');
    return phaseEnded || returnVisible;
  });
}

// Returns the player's current and max HP, or {0,0} if the card isn't present.
export async function readPlayerHp(): Promise<{ current: number; max: number }> {
  const page = await getPage();
  return page.evaluate(() => {
    const card = document.querySelector('.combatant-card.team-a');
    const hpText = card?.querySelector('.hp-text')?.textContent ?? '';
    const match = hpText.match(/(\d+)\s*\/\s*(\d+)/);
    return match
      ? { current: parseInt(match[1], 10), max: parseInt(match[2], 10) }
      : { current: 0, max: 0 };
  });
}

// Returns 'won' if no enemies remain on the board, 'lost' if the player is gone, or 'unknown'.
export async function readBattleResult(): Promise<'won' | 'lost' | 'unknown'> {
  const page = await getPage();
  return page.evaluate(() => {
    const playerOnBoard = !!document.querySelector('#board .combatant.team-a');
    const enemiesOnBoard = !!document.querySelector('#board .combatant.team-b');
    if (!enemiesOnBoard && playerOnBoard) return 'won';
    if (!playerOnBoard) return 'lost';
    return 'unknown';
  });
}

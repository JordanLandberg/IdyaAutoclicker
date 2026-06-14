import { getPage } from './browser.js';
import { readGameState } from './gameReader.js';
import { getValidMoves, predictEnemyMove } from './movement.js';
import { disconnect } from './browser.js';

async function main() {
  await getPage();
  const board = await readGameState();

  console.log('\n=== Board State ===');
  console.log(`Player:  (${board.player.col}, ${board.player.row})`);
  board.enemies.forEach((e, i) =>
    console.log(`Enemy ${i + 1}: (${e.col}, ${e.row})`)
  );
  console.log(`Trees:   ${board.trees.map(t => `(${t.col},${t.row})`).join(', ')}`);

  const playerMoves = getValidMoves(board.player, board.trees, board.enemies);
  console.log(`\nPlayer valid moves (${playerMoves.length}): ${playerMoves.map(m => `(${m.col},${m.row})`).join(', ')}`);

  board.enemies.forEach((e, i) => {
    const predicted = predictEnemyMove(e, board.player, board.trees);
    console.log(`Predicted enemy ${i + 1} move: (${predicted.col}, ${predicted.row})`);
  });

  await disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });

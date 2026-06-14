// Runtime configuration. Edit these defaults, or override via CLI args:
//   pnpm start -- <loops>

export const CONFIG = {
  loops: 50,
  idleWaitMs: 200,
  // Which hunt to start each loop: 1 = Lithkem Swallow
  baitNumber: 2 as 1 | 2 | 3 | 4 | 5 | 6 | 7,
  // Expected damage output per Empty Self attack (used to gauge whether a battle is winnable)
  damagePerAttack: 50,
  // Dev: never click Return to Town regardless of loop count
  skipReturn: false,
};

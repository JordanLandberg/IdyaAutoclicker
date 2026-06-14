# IdyaAutoclicker

An automated battle bot for the browser-based idle RPG [Idya](https://idya.io). It connects to a running Chrome instance via the Chrome DevTools Protocol, reads the game board from the DOM each turn, and uses a kiting/orbit strategy to fight battles without taking damage.

## How it works

1. Chrome is launched with remote debugging enabled (`launch-chrome.bat`)
2. Playwright attaches to that Chrome session
3. Each battle loop:
   - Starts a hunt, reads the board state (player position, enemies, trees)
   - Skips battles where total enemy HP exceeds twice the configured damage output
   - Aborts immediately if the player takes any damage
   - Alternates between **attack turns** (Empty Self) and **recover turns** (Fill Self)
   - Clicks "Return to Town" and starts the next loop

### Combat strategy

The bot uses an **orbit strategy** as its primary approach: it finds an isolated tree on the board and orbits its four diagonal corners, keeping the enemy blocked by the tree while maintaining line-of-sight for ranged attacks. This keeps the player out of enemy reach while dealing consistent damage.

When no suitable orbit tree is available, it falls back to a **scoring-based positioning system** that weighs distance from the enemy (current and predicted), board centrality, and mobility to choose the safest attack position.

Enemy movement is predicted each turn — since enemies always chase the player's *destination*, not their origin, the strategy accounts for where the enemy will be *after* the player moves.

## Tech stack

| Tool | Purpose |
|---|---|
| TypeScript | Language |
| Node.js | Runtime |
| [Playwright](https://playwright.dev) | Browser automation (CDP attach) |
| [Jimp](https://github.com/jimp-dev/jimp) | Image processing (pixel color sampling) |
| [tsx](https://github.com/privatenumber/tsx) | Run TypeScript directly without a build step |
| pnpm | Package manager |

## Setup

```bash
pnpm install
```

Requires Node.js and Chrome installed.

## Usage

**1. Launch Chrome with remote debugging:**

```bat
launch-chrome.bat
```

This kills any existing Chrome process and starts a fresh one on port `9222` with a temporary profile.

**2. Navigate to Idya in that Chrome window and log in.**

**3. Run the bot:**

```bash
# Run with the configured default number of loops
pnpm start

# Override loop count from the command line
pnpm start -- 100
```

**Dev utilities:**

```bash
# Print pixel colors at configured coordinates (useful for calibrating states)
pnpm run find-colors

# Print a text representation of the current board state
pnpm run debug-board
```

## Configuration

Edit [src/config.ts](src/config.ts):

```ts
export const CONFIG = {
  loops: 50,           // Number of battles to run
  idleWaitMs: 200,     // Delay between clicks (ms)
  baitNumber: 2,       // Which hunt to start (1–7, maps to a bait slot)
  damagePerAttack: 50, // Your Empty Self damage — used to screen battles by total HP
  skipReturn: false,   // Dev: skip "Return to Town" click (stays on battle screen)
};
```

## Folder structure

```
IdyaAutoclicker/
├── src/
│   ├── index.ts          # Entry point — main battle loop
│   ├── config.ts         # Runtime configuration
│   ├── browser.ts        # Playwright connection to Chrome (CDP)
│   ├── gameReader.ts     # Reads board state (player, enemies, trees, HP) from the DOM
│   ├── actions.ts        # Low-level helpers: click cell, choose action, submit intent, sleep
│   ├── dynamicTurn.ts    # Orchestrates a single turn: reads board → decides → clicks
│   ├── strategy.ts       # AI decision engine: orbit strategy + fallback positioning
│   ├── movement.ts       # Valid move generation, enemy movement prediction, line-of-sight
│   ├── grid.ts           # Grid types (Pos), bounds checking, distance functions
│   ├── types.ts          # Shared type definitions (GameState, Turn, TurnGuard)
│   ├── states.ts         # Game state definitions (pixel-color triggers and click targets)
│   ├── screen.ts         # Screen/pixel sampling utilities
│   ├── mouse.ts          # Mouse movement and click helpers
│   ├── logger.ts         # Session log file setup
│   ├── colorFinder.ts    # Dev tool: samples pixels at configured coordinates
│   └── debugBoard.ts     # Dev tool: prints a text map of the current board
├── logs/                 # Per-session log files (git-ignored)
├── launch-chrome.bat     # Starts Chrome with --remote-debugging-port=9222
├── package.json
├── pnpm-lock.yaml
└── tsconfig.json
```

## Notes

- The bot aborts any battle where it takes damage, prioritising survival over completion.
- Multi-enemy encounters are only accepted if their combined HP is within a winnable threshold.
- The orbit strategy gives up on a tree and excludes it temporarily if the enemy consistently blocks all attack lines from it.
- Logs for each session are written to `logs/` with a timestamp filename.

// Game state definitions.
// Each entry describes one detectable state: where to sample, what color means it's active,
// where to click, and optionally what pixel/color to wait for before continuing.
//
// HOW TO POPULATE:
//   1. Run `npm run find-colors` — it logs your cursor position and pixel color every 2 seconds.
//   2. Hover over each relevant screen region while the game is in the desired state.
//   3. Copy the logged (x, y) and color values into the entries below.
//   4. Tune `tolerance` (start at 10–20) if lighting or compression causes slight color shifts.

import type { GameState, Turn } from "./types.js";

const DEFAULT_HUNT: GameState[] = [
  {
    name: "hunt-click-pass",
    clickTarget: { x: 2375, y: 850 },
  },
  {
    name: "hunt-click-empty-self",
    clickTarget: { x: 2258, y: 850 },
  },
  {
    name: "hunt-click-fill-self",
    clickTarget: { x: 2569, y: 810 },
  },
  {
    name: "hunt-click-submit-intent-targeted-attack",
    clickTarget: { x: 2421, y: 794 },
  },
  {
    name: "hunt-click-submit-intent-reactive",
    clickTarget: { x: 2421, y: 891 },
  },
  {
    name: "hunt-click-return",
    pixel: { x: 2449, y: 791 },
    targetColor: { r: 61, g: 94, b: 77 },
    clickTarget: { x: 2449, y: 791 },
    tolerance: 15,
  },
];

const DEFAULT_HUNT_MAP: Record<string, GameState> = Object.fromEntries(
  DEFAULT_HUNT.map((state) => [state.name, state]),
);

export const GAME_STATES: Turn[] = [
  // START
  {
    states: [
      // SWALLOW SPOT 1
      {
        name: "start-hunt-second-bait-button",
        pixel: { x: 2314, y: 537 },
        targetColor: { r: 26, g: 46, b: 34 },
        clickTarget: { x: 2314, y: 537 },
        tolerance: 15,
      },
      // TOAD SPOT 2
      // {
      //   name: "start-hunt-second-bait-button",
      //   pixel: { x: 2658, y: 538 },
      //   targetColor: { r: 26, g: 46, b: 34 },
      //   clickTarget: { x: 2658, y: 538 },
      //   tolerance: 15,
      // },
      // DEER SPOT 2
      // {
      //   name: "start-hunt-second-bait-button",
      //   pixel: { x: 2644, y: 582 },
      //   targetColor: { r: 26, g: 46, b: 34 },
      //   clickTarget: { x: 2644, y: 582 },
      //   tolerance: 15,
      // },
    ],
  },
  // TURN 1
  {
    states: [
      { name: "hunt-turn-one-click-self", clickTarget: { x: 2233, y: 517 } },
      {
        name: "hunt-turn-one-click-move-space",
        clickTarget: { x: 2219, y: 443 },
      },
      DEFAULT_HUNT_MAP["hunt-click-pass"],
      DEFAULT_HUNT_MAP["hunt-click-submit-intent-reactive"],
    ],
  },
  // TURN 2
  {
    states: [
      { name: "hunt-turn-two-click-self", clickTarget: { x: 2219, y: 443 } },
      {
        name: "hunt-turn-two-click-self-move-space",
        clickTarget: { x: 2219, y: 443 },
      },
      DEFAULT_HUNT_MAP["hunt-click-empty-self"],
      {
        name: "hunt-turn-two-click-target-square",
        clickTarget: { x: 2435, y: 374 },
      },
      DEFAULT_HUNT_MAP["hunt-click-submit-intent-targeted-attack"],
    ],
  },
  // TURN 3
  {
    guard: {
      pixel: { x: 2449, y: 791 },
      targetColor: { r: 61, g: 94, b: 77 },
      tolerance: 15,
      invert: true,
    },
    states: [
      { name: "hunt-turn-three-click-self", clickTarget: { x: 2219, y: 443 } },
      {
        name: "hunt-turn-three-click-move-space",
        clickTarget: { x: 2283, y: 596 },
      },
      DEFAULT_HUNT_MAP["hunt-click-fill-self"],
      DEFAULT_HUNT_MAP["hunt-click-submit-intent-reactive"],
    ],
  },
  // TURN 4
  {
    guard: {
      pixel: { x: 2449, y: 791 },
      targetColor: { r: 61, g: 94, b: 77 },
      tolerance: 15,
      invert: true,
    },
    states: [
      { name: "hunt-turn-four-click-self", clickTarget: { x: 2283, y: 596 } },
      {
        name: "hunt-turn-four-click-move-space",
        clickTarget: { x: 2364, y: 663 },
      },
      DEFAULT_HUNT_MAP["hunt-click-empty-self"],
      {
        name: "hunt-turn-four-click-target-square",
        clickTarget: { x: 2213, y: 517 },
      },
      DEFAULT_HUNT_MAP["hunt-click-submit-intent-targeted-attack"],
    ],
  },
  // TURN 5
  {
    guard: {
      pixel: { x: 2449, y: 791 },
      targetColor: { r: 61, g: 94, b: 77 },
      tolerance: 15,
      invert: true,
    },
    states: [
      { name: "hunt-turn-five-click-self", clickTarget: { x: 2364, y: 663 } },
      {
        name: "hunt-turn-five-click-move-space",
        clickTarget: { x: 2499, y: 672 },
      },
      DEFAULT_HUNT_MAP["hunt-click-fill-self"],
      DEFAULT_HUNT_MAP["hunt-click-submit-intent-reactive"],
    ],
  },
  // TURN 6
  {
    guard: {
      pixel: { x: 2449, y: 791 },
      targetColor: { r: 61, g: 94, b: 77 },
      tolerance: 15,
      invert: true,
    },
    states: [
      { name: "hunt-turn-six-click-self", clickTarget: { x: 2499, y: 672 } },
      {
        name: "hunt-turn-six-click-move-space",
        clickTarget: { x: 2499, y: 672 },
      },
      DEFAULT_HUNT_MAP["hunt-click-empty-self"],
      {
        name: "hunt-turn-six-click-target-square",
        clickTarget: { x: 2426, y: 667 },
      },
      DEFAULT_HUNT_MAP["hunt-click-submit-intent-targeted-attack"],
    ],
  },
  // RETURN
  {
    states: [DEFAULT_HUNT_MAP["hunt-click-return"]],
  },
];

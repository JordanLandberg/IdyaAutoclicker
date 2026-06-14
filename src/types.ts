// Shared types used across all modules.
// To add a new game state, define it in states.ts using these types.

export type Color = {
  r: number;
  g: number;
  b: number;
};

export interface GameState {
  // Label for logging
  name: string;
  // Pixel to sample each iteration to detect this state
  pixel?: { x: number; y: number };
  // The color that pixel must match (within tolerance) to trigger this state
  targetColor?: Color;
  // Where to click when this state is detected
  clickTarget: { x: number; y: number };
  // Tolerance for color matching (0–255 per channel)
  tolerance?: number;
}

// A single screenshot check — if the pixel doesn't match, the whole turn is skipped
export interface TurnGuard {
  pixel: { x: number; y: number };
  targetColor: Color;
  tolerance?: number;
  // If true, the turn runs when the color does NOT match (skip if matched)
  invert?: boolean;
}

export interface Turn {
  states: GameState[];
  // If present, the turn is skipped when the pixel doesn't match
  guard?: TurnGuard;
}

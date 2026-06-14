// Color finder helper — run with `pnpm run find-colors`.
// Every 2000ms logs two readings for your cursor position:
//   - hovered:   color with the mouse still over the element
//   - un-hovered: color after moving the mouse away (what the autoclicker will see)
// Copy the appropriate value into states.ts depending on which state you want to detect.

import { getMousePos, moveMouse } from "./mouse.js";
import { takeScreenshot, getPixelColor } from "./screen.js";

const NEUTRAL_X = 0;
const NEUTRAL_Y = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tick(): Promise<void> {
  const { x, y } = getMousePos();

  // --- Hovered reading: screenshot while mouse is still in place ---
  const hoveredImage = await takeScreenshot();
  const hoveredColor = getPixelColor(hoveredImage, x, y);

  // --- Un-hovered reading: move away, wait, screenshot, move back ---
  moveMouse(NEUTRAL_X, NEUTRAL_Y);
  await delay(150);
  const unhoveredImage = await takeScreenshot();
  moveMouse(x, y);
  const unhoveredColor = getPixelColor(unhoveredImage, x, y);

  console.log(`pos=(${x}, ${y})`);
  console.log(`  hovered:    rgb(${hoveredColor.r}, ${hoveredColor.g}, ${hoveredColor.b})`);
  console.log(`  un-hovered: rgb(${unhoveredColor.r}, ${unhoveredColor.g}, ${unhoveredColor.b})`);
  console.log();
}

console.log("Color finder running — hover over areas of interest. Ctrl+C to stop.\n");

tick();
setInterval(tick, 2000);

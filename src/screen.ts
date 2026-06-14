// Screen utilities: capture screenshots and read pixel colors.
// Uses PowerShell + System.Drawing to capture the screen — no native binaries required.
// All pixel reads within one loop iteration share the same Jimp image for consistency.

import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync } from "fs";
import { Jimp, intToRGBA } from "jimp";
import type { Color } from "./types.js";

function captureScript(outPath: string): string {
  const escaped = outPath.replace(/\\/g, "\\\\");
  return `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$g.Dispose()
$bmp.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
`.trim();
}

export async function takeScreenshot(): Promise<Jimp> {
  const outPath = join(tmpdir(), `autoclicker_${Date.now()}.png`);
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", captureScript(outPath)], {
    windowsHide: true,
  });
  const image = await Jimp.read(outPath);
  try { unlinkSync(outPath); } catch { /* ignore */ }
  return image;
}

export function getPixelColor(image: Jimp, x: number, y: number): Color {
  const hex = image.getPixelColor(x, y);
  const { r, g, b } = intToRGBA(hex);
  return { r, g, b };
}

// Returns true if each RGB channel of actual is within tolerance of target.
export function colorsMatch(actual: Color, target: Color, tolerance: number): boolean {
  return (
    Math.abs(actual.r - target.r) <= tolerance &&
    Math.abs(actual.g - target.g) <= tolerance &&
    Math.abs(actual.b - target.b) <= tolerance
  );
}

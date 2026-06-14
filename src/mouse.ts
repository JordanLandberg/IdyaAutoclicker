// Windows mouse control via PowerShell — no native build tools required.
// Wraps user32.dll mouse_event and Cursor.Position through inline C# loaded by Add-Type.

import { execFileSync } from "child_process";

// Reusable inline C# that exposes mouse_event and GetCursorPos from user32.dll
const MOUSE_TYPE = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Mouse {
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
    public struct POINT { public int X; public int Y; }
    public static void Click(int x, int y) {
        SetCursorPos(x, y);
        mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero); // MOUSEEVENTF_LEFTDOWN
        mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero); // MOUSEEVENTF_LEFTUP
    }
    public static string GetPos() {
        POINT p; GetCursorPos(out p); return p.X + "," + p.Y;
    }
}
'@
`.trim();

function runPS(script: string): string {
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

export function moveMouse(x: number, y: number): void {
  runPS(`${MOUSE_TYPE}; [Mouse]::SetCursorPos(${x}, ${y})`);
}

export function clickAt(x: number, y: number): void {
  runPS(`${MOUSE_TYPE}; [Mouse]::Click(${x}, ${y})`);
}

export function getMousePos(): { x: number; y: number } {
  const raw = runPS(`${MOUSE_TYPE}; [Mouse]::GetPos()`);
  const [x, y] = raw.split(",").map(Number);
  return { x, y };
}

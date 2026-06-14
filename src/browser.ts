import { chromium, type Browser, type Page } from 'playwright';

// Disconnect cleanly on Ctrl+C so the CDP session doesn't stay attached to Chrome.
process.on('SIGINT', async () => {
  await disconnect();
  process.exit(0);
});

let browser: Browser | null = null;
let page: Page | null = null;

export async function getPage(): Promise<Page> {
  if (page && !page.isClosed()) return page;

  // Reset any stale references before reconnecting.
  page = null;
  browser = null;

  // Retry a few times with a short per-attempt timeout — Chrome's DevTools protocol
  // can take a moment to become ready after launch.
  const maxAttempts = 5;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      browser = await chromium.connectOverCDP('http://localhost:9222', { timeout: 8000 });
      break;
    } catch (err) {
      lastErr = err;
      browser = null;
      if (attempt < maxAttempts) {
        console.log(`[browser] connection attempt ${attempt}/${maxAttempts} failed — retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  if (!browser) throw lastErr;

  browser.on('disconnected', () => { browser = null; page = null; });

  const contexts = browser.contexts();
  if (contexts.length === 0) throw new Error('No browser contexts found. Is Chrome running with --remote-debugging-port=9222?');

  const pages = contexts[0].pages();
  if (pages.length === 0) throw new Error('No open pages found in browser context.');

  // Find the game page, or fall back to the first page
  page = pages.find(p => p.url().includes('idya') || p.url().includes('combat')) ?? pages[0];
  page.on('close', () => { page = null; });
  console.log(`[browser] connected to page: ${page.url()}`);
  return page;
}

export async function disconnect(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
  }
}

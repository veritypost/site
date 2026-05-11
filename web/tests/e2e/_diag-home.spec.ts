import { test, expect } from '@playwright/test';
import { getSeed } from './_fixtures/seed';
import { writeFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supa = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`signIn failed: ${error?.message}`);
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)![1];
  const sessionJson = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_in: data.session.expires_in,
    expires_at: data.session.expires_at,
    token_type: data.session.token_type,
    user: data.session.user,
  });
  const value = 'base64-' + Buffer.from(sessionJson).toString('base64');
  await page.context().addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

const VIEWPORTS = [
  { name: 'mobile-sm', w: 360, h: 760 },     // small Android
  { name: 'mobile-md', w: 390, h: 844 },     // iPhone 14
  { name: 'mobile-lg', w: 430, h: 932 },     // iPhone 15 Pro Max
  { name: 'mobile-land', w: 844, h: 390 },   // landscape
  { name: 'tablet', w: 820, h: 1180 },       // iPad
  { name: 'tablet-lg', w: 1024, h: 1366 },   // iPad Pro
  { name: 'laptop', w: 1280, h: 800 },       // 13"
  { name: 'desktop', w: 1440, h: 900 },      // 15-16"
  { name: 'desktop-lg', w: 1920, h: 1080 },  // 24"+
];

test('diag — capture v2 at all viewports', async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync('/tmp/v2-cmp/shots', { recursive: true });
  const seed = getSeed();
  await login(page, seed!.users.owner.email, seed!.password);

  const reports: Record<string, unknown> = {};

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto('/home-v2-preview', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(800);
    // Dismiss onboarding + cookie banner so they don't block screenshots
    await page.evaluate(() => {
      const close = (sel: string) => {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          el.style.display = 'none';
        });
      };
      close('[role="dialog"]');
      close('.cookie-banner, [data-cookie-banner], .vp-cookie-banner');
      // Common Next portal wrappers
      close('div[data-radix-portal]');
    });
    if (vp.w <= 768) {
      const carousel = page.locator('.vp-swipe').first();
      if (await carousel.count()) {
        await carousel.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        const swipeCount = await page.locator('.vp-swipe').count();
        const railOverflow = await page.evaluate(() => {
          const rail = document.querySelector('.vp-secondary');
          if (!rail) return 'no rail';
          return {
            sw: (rail as HTMLElement).scrollWidth,
            cw: (rail as HTMLElement).clientWidth,
            children: rail.children.length,
            inSwipe: !!rail.parentElement?.classList.contains('vp-swipe'),
          };
        });
        console.log(`[${vp.name}] swipe wrappers: ${swipeCount}, rail:`, railOverflow);
        await carousel.screenshot({
          path: `/tmp/v2-cmp/shots/${vp.name}-carousel.png`,
        });
      }
    }

    // Full-page screenshot
    await page.screenshot({
      path: `/tmp/v2-cmp/shots/${vp.name}-${vp.w}x${vp.h}-full.png`,
      fullPage: true,
    });
    // Above-fold
    await page.screenshot({
      path: `/tmp/v2-cmp/shots/${vp.name}-${vp.w}x${vp.h}-fold.png`,
      fullPage: false,
    });

    const r = await page.evaluate(() => {
      const slots = Array.from(document.querySelectorAll('.vp-home-slot')) as HTMLElement[];
      const main = document.querySelector('.vp-home-v2-main') as HTMLElement | null;
      const rail = document.querySelector('.vp-home-v2-rail') as HTMLElement | null;
      const canvas = document.querySelector('.vp-home-v2-canvas') as HTMLElement | null;
      const ticker = document.querySelector('.vp-ticker') as HTMLElement | null;
      const sidebar = document.querySelector('[data-home-sidebar], aside.home-sidebar, nav.home-sidebar, .home-sidebar') as HTMLElement | null;
      const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
      // Find any element wider than the viewport
      const all = Array.from(document.querySelectorAll<HTMLElement>('main *'));
      const overflowers: { tag: string; cls: string; w: number }[] = [];
      const vw = window.innerWidth;
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.right > vw + 1 || r.left < -1) {
          overflowers.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || '').toString().slice(0, 80),
            w: Math.round(r.width),
          });
          if (overflowers.length >= 8) break;
        }
      }
      // Hero metrics
      const heroHed = document.querySelector('.vp-hero__hed') as HTMLElement | null;
      const heroHedLines = heroHed
        ? Math.round(heroHed.getBoundingClientRect().height / parseFloat(getComputedStyle(heroHed).lineHeight))
        : 0;
      // Timeline date column
      const tlDate = document.querySelector('.vp-rail-block .vp-timeline__date, .vp-rail-block [data-timeline-date]') as HTMLElement | null;
      // Rail block clamp
      const railBlocks = Array.from(document.querySelectorAll('.vp-rail-block')) as HTMLElement[];
      return {
        canvas: canvas ? { w: Math.round(canvas.getBoundingClientRect().width), maxW: getComputedStyle(canvas).maxWidth } : null,
        main: main ? Math.round(main.getBoundingClientRect().width) : null,
        rail: rail ? Math.round(rail.getBoundingClientRect().width) : null,
        railBlockCount: railBlocks.length,
        ticker: ticker ? Math.round(ticker.getBoundingClientRect().width) : null,
        sidebarPresent: !!sidebar,
        slotCount: slots.length,
        slotKinds: slots.map((s) => ({
          kind: s.dataset.kind,
          w: Math.round(s.getBoundingClientRect().width),
          h: Math.round(s.getBoundingClientRect().height),
        })),
        docOverflow,
        overflowers,
        heroHedFontPx: heroHed ? getComputedStyle(heroHed).fontSize : null,
        heroHedLines,
      };
    });
    reports[vp.name] = r;
  }
  writeFileSync('/tmp/v2-cmp/shots/report.json', JSON.stringify(reports, null, 2));

  expect(true).toBe(true);
});

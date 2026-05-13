// Cluster slot — emits a fragment of bordered, typographic article cards
// matching the "reimagined homepage" rest-of-grid aesthetic. The
// parent HomeLayout grid lays the cards out; this component does not
// wrap them in a container.
//
// Style classes (vp-rh-card, vp-rh-tag, vp-rh-title, vp-rh-summary,
// vp-rh-arrow) are defined in HomeRoot.tsx's RhStyles() block and will
// move to HomeLayout.tsx in a follow-up step — so this file ships no
// <style> tags.

import { Fragment, type ReactElement } from 'react';
import Link from 'next/link';
import type { SlotRow } from '../types';
import type { CardCtx, HomeStory } from './_shared';
import SsrAdCell from '../_SsrAdCell';

function articleHref(s: HomeStory): string {
  const slug = s.stories?.slug;
  return slug ? `/${slug}` : '#';
}

function categoryName(
  story: HomeStory,
  byId: CardCtx['categoryById'],
): string {
  if (!story.category_id) return 'News';
  const c = byId[story.category_id];
  return c?.name || 'News';
}

export default async function Cluster({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  // Per-item dispatch on content_type. Mixed-type clusters render
  // articles + ads in declared order; unknown/unsupported types are
  // silently skipped (no empty grid cells). Cap counts mixed types
  // together — 12 articles + 4 ads renders 15 total.
  //
  // Ad items delegate to <SsrAdCell />, which probes server-side, logs
  // the impression, rewrites the CTA href, and mounts the beacon. The
  // cell returns null when no campaign is eligible, so empty bordered
  // tiles never appear in the grid when ads are off.
  // Cell-count cap. Owner can override via home_slots.config.capacity
  // (validated 1..30 server-side); default 15 keeps the historic shape.
  const cfgCap = slot.config?.capacity;
  const cap =
    typeof cfgCap === 'number' && cfgCap > 0 && cfgCap <= 30 ? cfgCap : 15;
  const items = [...slot.items]
    .sort((a, b) => a.position - b.position)
    .slice(0, cap);

  const nodes = await Promise.all(
    items.map(async (item) => {
      if (item.content_type === 'article') {
        const s = item.article;
        if (!s || !s.stories?.slug) return null;
        return (
          <Link key={item.id} href={articleHref(s)} className="vp-rh-card" data-testid="home-article-link">
            <span className="vp-rh-tag">
              {categoryName(s, ctx.categoryById)}
            </span>
            <h2 className="vp-rh-title">{s.title}</h2>
            {s.excerpt && <p className="vp-rh-summary">{s.excerpt}</p>}
            <span className="vp-rh-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        );
      }
      if (item.content_type === 'ad') {
        const placement = item.payload?.placement;
        if (typeof placement !== 'string' || placement.length === 0) {
          return null;
        }
        const cell = await SsrAdCell({
          placement,
          page: 'home',
          position: `cluster:${placement}`,
          wrapperClassName: 'vp-rh-card vp-rh-card-ad',
          selector: `.vp-rh-card-ad[data-cluster-ad-id="${item.id}"]`,
          dataAttrs: { 'data-cluster-ad-id': String(item.id) },
        });
        if (!cell) return null;
        return <Fragment key={item.id}>{cell}</Fragment>;
      }
      return null;
    }),
  );

  const rendered = nodes.filter(
    (node): node is ReactElement => node !== null,
  );

  if (rendered.length === 0) return null;

  return <Fragment>{rendered}</Fragment>;
}

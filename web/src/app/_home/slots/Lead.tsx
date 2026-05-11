// Lead slot — bordered hero card matching the "reimagined homepage"
// aesthetic. Renders the slot's first article as a typographic hero with
// a 1.618:1 golden-ratio split when the parent story has 3+ timeline
// events; otherwise renders content-only.
//
// Style classes (vp-rh-card, vp-rh-lead, vp-rh-lead-with-timeline,
// vp-rh-tag, etc.) are defined in HomeRoot.tsx's RhStyles() block and
// will move to HomeLayout.tsx in a follow-up step — so this file ships
// no <style> tags.

import Link from 'next/link';
import { Source_Serif_4, IBM_Plex_Mono } from 'next/font/google';
import { createServiceClient } from '@/lib/supabase/server';
import type { SlotRow } from '../types';
import type { CardCtx, HomeStory } from './_shared';

const serif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

type TimelineRow = {
  id: string;
  event_date: string;
  event_label: string;
  sort_order: number;
  metadata: { current?: boolean } | null;
};

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

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

export default async function Lead({
  slot,
  ctx,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const lead = slot.items
    .map((i) => i.article)
    .find((s): s is HomeStory => !!s);
  if (!lead) return null;

  // story_id isn't on the HomeStory projection type — mirror HomeRoot's
  // cast. The underlying articles row carries the column.
  const leadStoryId =
    (lead as HomeStory & { story_id?: string | null }).story_id ?? null;

  let leadTimeline: TimelineRow[] = [];
  if (leadStoryId) {
    const service = createServiceClient();
    const { data } = await service
      .from('timelines')
      .select('id, event_date, event_label, sort_order, metadata')
      .eq('story_id', leadStoryId)
      .order('event_date', { ascending: false })
      .limit(4);
    const rows = ((data as TimelineRow[] | null) || []).slice().reverse();
    if (rows.length >= 3) leadTimeline = rows;
  }

  const leadCat = categoryName(lead, ctx.categoryById);
  const hasTimeline = leadTimeline.length > 0;

  return (
    <article
      className={`vp-rh-card vp-rh-lead ${hasTimeline ? 'vp-rh-lead-with-timeline' : ''}`}
    >
      <Link href={articleHref(lead)} className="vp-rh-lead-link">
        <div className="vp-rh-lead-content">
          <span className={`vp-rh-tag vp-rh-tag-accent ${mono.className}`}>
            {leadCat}
          </span>
          <h2 className={`vp-rh-lead-title ${serif.className}`}>
            {lead.title}
          </h2>
          {lead.excerpt && (
            <p className="vp-rh-lead-summary">{lead.excerpt}</p>
          )}
        </div>
      </Link>
      {hasTimeline && (
        <aside className="vp-rh-timeline">
          <span className={`vp-rh-tl-label ${mono.className}`}>Timeline</span>
          <ul>
            {leadTimeline.map((t, i) => {
              const isNow =
                !!t.metadata?.current || i === leadTimeline.length - 1;
              return (
                <li key={t.id} className={isNow ? 'now' : undefined}>
                  <strong className={mono.className}>
                    {isNow ? 'Today: ' : `${shortDate(t.event_date)}: `}
                  </strong>
                  <span>{t.event_label}</span>
                </li>
              );
            })}
          </ul>
          <Link
            href={articleHref(lead)}
            className={`vp-rh-readmore ${mono.className}`}
          >
            Read full report →
          </Link>
        </aside>
      )}
    </article>
  );
}

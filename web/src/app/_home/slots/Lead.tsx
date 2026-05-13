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
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import type { SlotRow } from '../types';
import type { CardCtx, HomeStory } from './_shared';

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

// Cached per story_id. First visit pays the roundtrip; repeat visits
// within 5 minutes (or until a `story-timeline:{storyId}` invalidation)
// come from cache. Threshold check (rows.length >= 3) happens inside
// the cached function so under-threshold stories cache the empty array
// instead of re-fetching.
async function fetchLeadTimeline(storyId: string): Promise<TimelineRow[]> {
  const service = createServiceClient();
  const { data } = await service
    .from('timelines')
    .select('id, event_date, event_label, sort_order, metadata')
    .eq('story_id', storyId)
    .order('event_date', { ascending: false })
    .limit(4);
  const rows = ((data as TimelineRow[] | null) || []).slice().reverse();
  return rows.length >= 3 ? rows : [];
}

function getCachedLeadTimeline(storyId: string): Promise<TimelineRow[]> {
  return unstable_cache(
    () => fetchLeadTimeline(storyId),
    ['lead-timeline', storyId],
    { tags: ['story-timeline', `story-timeline:${storyId}`], revalidate: 300 },
  )();
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
    leadTimeline = await getCachedLeadTimeline(leadStoryId);
  }

  const leadCat = categoryName(lead, ctx.categoryById);
  const hasTimeline = leadTimeline.length > 0;

  return (
    <article
      className={`vp-rh-card vp-rh-lead ${hasTimeline ? 'vp-rh-lead-with-timeline' : ''}`}
    >
      <Link href={articleHref(lead)} className="vp-rh-lead-link" data-testid="home-article-link">
        <div className="vp-rh-lead-content">
          <span className="vp-rh-tag vp-rh-tag-accent">
            {leadCat}
          </span>
          <h2 className="vp-rh-lead-title">
            {lead.title}
          </h2>
          {lead.excerpt && (
            <p className="vp-rh-lead-summary">{lead.excerpt}</p>
          )}
        </div>
      </Link>
      {hasTimeline && (
        <aside className="vp-rh-timeline">
          <span className="vp-rh-tl-label">Timeline</span>
          <ul>
            {leadTimeline.map((t, i) => {
              const isNow =
                !!t.metadata?.current || i === leadTimeline.length - 1;
              return (
                <li key={t.id} className={isNow ? 'now' : undefined}>
                  <strong>
                    {isNow ? 'Today: ' : `${shortDate(t.event_date)}: `}
                  </strong>
                  <span>{t.event_label}</span>
                </li>
              );
            })}
          </ul>
          {/* Inner CTA is a visual cue for sighted users — same destination
              as the outer Link wrapping the article body. Hidden from
              assistive tech to avoid the "two landing targets to the same
              story" duplication. */}
          <Link
            href={articleHref(lead)}
            className="vp-rh-readmore"
            aria-hidden="true"
            tabIndex={-1}
          >
            Read full report →
          </Link>
        </aside>
      )}
    </article>
  );
}

// Lead slot — bordered hero card matching the "reimagined homepage"
// aesthetic. Renders the slot's first article as a typographic hero with
// a 1.618:1 golden-ratio split when the parent story has 3+ timeline
// events; otherwise renders content-only.
//
// Style classes (vp-rh-card, vp-rh-lead, vp-rh-lead-with-timeline,
// vp-rh-tag, etc.) are defined in HomeRoot.tsx's RhStyles() block and
// will move to HomeLayout.tsx in a follow-up step — so this file ships
// no <style> tags.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { unstable_cache } from 'next/cache';
import { createServiceClient } from '@/lib/supabase/server';
import type { SlotRow } from '../types';
import type { CardCtx, HomeStory } from './_shared';
import { timeShort, HOME_EDITORIAL_TZ } from '../_shared';

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

function eventDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: HOME_EDITORIAL_TZ,
    month: 'short',
    day: '2-digit',
  }).format(d);
}

// Derive the lifecycle label (e.g. "Developing", "Breaking") shown in the
// hero status row. Prefer the canonical `stories.lifecycle_status` text,
// fall back to the per-article booleans so older rows without a story-level
// status still light up correctly. Returns null when there's nothing to
// surface, so the caller can omit the pill cleanly.
function lifecycleLabel(story: HomeStory): string | null {
  const raw = story.stories?.lifecycle_status?.trim();
  if (raw) {
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  if (story.is_breaking) return 'Breaking';
  if (story.is_developing) return 'Developing';
  return null;
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
  const lifecycle = lifecycleLabel(lead);
  const updatedAgo = timeShort(lead.updated_at ?? lead.published_at);
  const timelineCount = leadTimeline.length;
  // Compose pills as a list so we can interleave separators without
  // ending up with leading/trailing dots when fields are missing.
  const statusPills: ReactNode[] = [];
  if (lifecycle) {
    statusPills.push(
      <span
        key="lifecycle"
        style={{
          color: 'var(--vp-accent)',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {lifecycle}
      </span>,
    );
  }
  if (timelineCount > 0) {
    statusPills.push(
      <span key="timeline">
        {timelineCount} timeline {timelineCount === 1 ? 'event' : 'events'}
      </span>,
    );
  }
  if (updatedAgo) {
    statusPills.push(<span key="updated">Last changed {updatedAgo}</span>);
  }

  return (
    <article
      className={`vp-rh-card vp-rh-lead ${hasTimeline ? 'vp-rh-lead-with-timeline' : ''}`}
    >
      <Link href={articleHref(lead)} className="vp-rh-lead-link" data-testid="home-article-link">
        <div className="vp-rh-lead-content">
          <span className="vp-rh-tag vp-rh-tag-accent vp-rh-tag--lead">
            {leadCat}
          </span>
          <h2 className="vp-rh-lead-title">
            {lead.title}
          </h2>
          {lead.excerpt && (
            <p className="vp-rh-lead-summary">{lead.excerpt}</p>
          )}
          {statusPills.length > 0 && (
            <div
              style={{
                margin: '14px 0 4px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                fontFamily:
                  'var(--font-ibm-mono), "SFMono-Regular", Consolas, monospace',
                fontSize: 11,
                letterSpacing: '0.06em',
                color: 'var(--vp-text-soft)',
                alignItems: 'center',
              }}
            >
              {statusPills.map((pill, i) => (
                <span
                  key={i}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                  {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
                  {pill}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
      {hasTimeline && (
        <aside className="vp-rh-timeline">
          <span className="vp-rh-tl-label">How we got here</span>
          <ul>
            {leadTimeline.map((t, i) => {
              const isNow =
                !!t.metadata?.current || i === leadTimeline.length - 1;
              const dateLabel = isNow ? 'Today' : eventDateLabel(t.event_date);
              const eventText = isNow
                ? `${t.event_label} — this article`
                : t.event_label;
              return (
                <li
                  key={t.id}
                  className={`vp-rh-tl-event${isNow ? ' vp-rh-tl-event--now' : ''}`}
                >
                  <span className="vp-rh-tl-date">{dateLabel}</span>
                  {eventText}
                </li>
              );
            })}
          </ul>
        </aside>
      )}
    </article>
  );
}

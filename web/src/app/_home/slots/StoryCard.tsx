// Story card — single article in a horizontal main-column cell. The
// mock grid stacks ~7 of these between pos 20 and pos 56 at span 8.
// Renders eyebrow (category) + headline + dek + optional cover image
// (right side). Ad variant routes through the universal `<Ad>` so the
// mock's "ad/story — swap per viewer tier" semantics work end-to-end.

import type React from 'react';
import Link from 'next/link';
import Ad from '@/components/Ad';
import type { SlotRow } from '../types';
import RelativeTime from '../RelativeTime';
import { type CardCtx, categoryFor, storyHref } from './_shared';

export default function StoryCard({ slot, ctx }: { slot: SlotRow; ctx: CardCtx }) {
  const item = slot.items[0];
  if (!item) return null;
  const variant = (slot.config as { variant?: string } | null)?.variant;
  const isHero = variant === 'hero';
  const heroClass = isHero ? ' vp-rh-story-card--hero' : '';

  if (item.content_type === 'ad') {
    const placement = (item.payload?.placement as string) || 'home_in_feed';
    return (
      <article className={`vp-rh-story-card vp-rh-story-card--ad${heroClass}`}>
        <Ad placement={placement} page="home" position="in_body" />
      </article>
    );
  }

  const story = item.article;
  if (!story) return null;
  const href = storyHref(story);
  const cat = categoryFor(story, ctx);

  const Heading = isHero ? 'h2' : 'h3';
  const timeline = isHero ? ctx.heroTimeline : undefined;
  const heroMeta = isHero ? ctx.heroMeta : undefined;

  // Meta strip — only "Last changed Xm ago". The lifecycle badge,
  // timeline-event count, and sources count were dropped per owner
  // call 2026-05-16 (the strip should stay quiet under the dek).
  const metaParts: { key: string; node: React.ReactElement }[] = [];
  if (heroMeta?.lastChangedRelative) {
    metaParts.push({
      key: 'lc-ts',
      node: (
        <span>
          Last changed{' '}
          {heroMeta.lastChangedIso ? (
            <RelativeTime
              iso={heroMeta.lastChangedIso}
              initial={heroMeta.lastChangedRelative}
            />
          ) : (
            heroMeta.lastChangedRelative
          )}
        </span>
      ),
    });
  }

  const body = (
    <>
      <div className="vp-rh-story-card__body">
        {cat?.name && <p className="vp-rh-story-card__cat">{cat.name}</p>}
        <Heading className="vp-rh-story-card__title">{story.title}</Heading>
        {story.excerpt && (
          <p className="vp-rh-story-card__dek">{story.excerpt}</p>
        )}
        {isHero && metaParts.length > 0 && (
          <p className="vp-rh-hero-meta">
            {metaParts.map((p, i) => (
              <span key={p.key} className="vp-rh-hero-meta__seg">
                {i > 0 && (
                  <span className="vp-rh-hero-meta__sep" aria-hidden="true">
                    ·
                  </span>
                )}
                {p.node}
              </span>
            ))}
          </p>
        )}
        {isHero && heroMeta?.changeNote && (
          <p className="vp-rh-hero-change">
            <span className="vp-rh-hero-change__lede">Changed today:</span>{' '}
            {heroMeta.changeNote}
          </p>
        )}
      </div>
      {isHero && timeline && timeline.length > 0 && (
        <aside className="vp-rh-hero-timeline" aria-label="How we got here">
          <p className="vp-rh-hero-timeline__label">How we got here</p>
          <div className="vp-rh-hero-timeline__list">
            {timeline.map((ev) => {
              const itemClass = `vp-rh-tl-event${
                ev.isToday ? ' vp-rh-tl-event--now' : ''
              }`;
              return (
                <div key={ev.id} className={itemClass}>
                  <span className="vp-rh-tl-event__date">
                    {ev.isToday ? (
                      'Today'
                    ) : ev.event_date ? (
                      <time dateTime={ev.event_date}>
                        {new Date(ev.event_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    ) : null}
                  </span>
                  {ev.event_label && (
                    <span className="vp-rh-tl-event__head">
                      {ev.event_label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}
    </>
  );

  return (
    <article className={`vp-rh-story-card${heroClass}`}>
      {href ? (
        <Link href={href} className="vp-rh-story-card__link">{body}</Link>
      ) : (
        <div className="vp-rh-story-card__link">{body}</div>
      )}
    </article>
  );
}

import type { ReactElement } from 'react';
import SsrAdCell from '../_SsrAdCell';
import { StoryLink, categoryFor, type CardCtx, type HomeStory } from './_shared';
import type { SlotRow } from '../types';
import { HOME_EDITORIAL_TZ, timeShort } from '../_shared';

function relativeDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const dayMs = 86400000;
  const startOfTodayUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const startOfDateUTC = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
  );
  const diffDays = Math.round((startOfTodayUTC - startOfDateUTC) / dayMs);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: HOME_EDITORIAL_TZ,
    month: 'short',
    day: 'numeric',
  })
    .format(d)
    .toUpperCase();
}

export default async function ListRail({ slot, ctx }: { slot: SlotRow; ctx: CardCtx }) {
  // Per-item dispatch (mirrors Cluster.tsx). The rail is a single
  // narrow column of list rows — ads render as bare <li> containing the
  // Ad component, NOT wrapped in vp-rh-card-ad (which is a bordered
  // card meant for the article-grid slots; would look out of place
  // inside the dark rail). Cap mixed items at 5 total.
  // Row-count cap. Owner can override via home_slots.config.capacity
  // (validated 1..30 server-side); default 5 matches the historic rail.
  const cfgCap = slot.config?.capacity;
  const cap =
    typeof cfgCap === 'number' && cfgCap > 0 && cfgCap <= 30 ? cfgCap : 5;
  const items = [...slot.items]
    .sort((a, b) => a.position - b.position)
    .slice(0, cap);

  // Bail early if nothing renderable. A "renderable" item is an article
  // with an attached HomeStory, or an ad with a non-empty placement.
  const hasAny = items.some((i) => {
    if (i.content_type === 'article') return !!i.article;
    if (i.content_type === 'ad') {
      const p = i.payload?.placement;
      return typeof p === 'string' && p.length > 0;
    }
    return false;
  });
  if (!hasAny) return null;

  const label =
    typeof slot.config.label === 'string' ? slot.config.label : 'More stories';
  const numbered = slot.config.numbered === true;
  const showTimestamps = slot.config.timestamps === true;
  const railText = 'rgba(255,255,255,0.94)';
  const railSoft = 'rgba(255,255,255,0.72)';
  const railDim = 'rgba(255,255,255,0.54)';

  // Track article index separately so numbered-list rendering keeps
  // sequential 1/2/3 even when ads sit between articles.
  let articleIdx = 0;

  const renderItem = async (
    item: (typeof items)[number],
    rowIdx: number,
  ): Promise<ReactElement | null> => {
    if (item.content_type === 'ad') {
      const placement = item.payload?.placement;
      if (typeof placement !== 'string' || placement.length === 0) return null;
      const page =
        typeof item.payload?.page === 'string' && item.payload.page
          ? (item.payload.page as string)
          : 'home';
      const position =
        typeof item.payload?.position === 'string' && item.payload.position
          ? (item.payload.position as string)
          : `list_rail:${placement}`;
      const cell = await SsrAdCell({
        placement,
        page,
        position,
        wrapperClassName: 'vp-rail-ad-cell',
        selector: `.vp-rail-ad-cell[data-rail-ad-id="${item.id}"]`,
        dataAttrs: { 'data-rail-ad-id': String(item.id) },
      });
      if (!cell) return null;
      return (
        <li key={item.id} style={{ listStyle: 'none' }}>
          {cell}
        </li>
      );
    }
    if (item.content_type !== 'article') return null;
    const story = item.article;
    if (!story) return null;
    const idx = articleIdx++;
    return renderStoryRow(item.id, story, idx, rowIdx);
  };

  function renderStoryRow(
    key: string,
    story: HomeStory,
    idx: number,
    _rowIdx: number,
  ): ReactElement {
    if (numbered) {
      const cat = categoryFor(story, ctx);
      const meta = [cat?.name, timeShort(story.published_at)]
        .filter(Boolean)
        .join(' · ');
      return (
        <li
          key={key}
          style={{
            display: 'grid',
            gridTemplateColumns: '22px 1fr',
            gap: 8,
            alignItems: 'baseline',
          }}
        >
          <span
            style={{
              font: '800 26px/1 var(--p-serif)',
              color: railText,
            }}
          >
            {idx + 1}
          </span>
          <div style={{ minWidth: 0 }}>
            <StoryLink story={story}>
              <span
                style={{
                  font: '600 14px/1.35 var(--p-sans)',
                  color: railText,
                  display: 'block',
                }}
              >
                {story.title}
              </span>
            </StoryLink>
            {meta && (
              <div
                style={{
                  font: '500 10px/1 var(--p-sans)',
                  color: railDim,
                  marginTop: 4,
                  letterSpacing: '.04em',
                  textTransform: 'uppercase',
                }}
              >
                {meta}
              </div>
            )}
          </div>
        </li>
      );
    }

    if (showTimestamps) {
      return (
        <li
          key={key}
          style={{
            display: 'grid',
            gridTemplateColumns: '76px 1fr',
            gap: 8,
            alignItems: 'baseline',
          }}
        >
          <span
            style={{
              font: '700 11px/1 var(--p-sans)',
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              color: railDim,
            }}
          >
            {relativeDate(story.published_at)}
          </span>
          <div style={{ minWidth: 0 }}>
            <StoryLink story={story}>
              <span
                style={{
                  font: '600 13px/1.35 var(--p-sans)',
                  color: railText,
                  display: 'block',
                }}
              >
                {story.title}
              </span>
            </StoryLink>
          </div>
        </li>
      );
    }

    return (
      <li key={key}>
        <StoryLink story={story}>
          <span
            style={{
              font: '600 13px/1.35 var(--p-sans)',
              color: railSoft,
              display: 'block',
            }}
          >
            {story.title}
          </span>
        </StoryLink>
      </li>
    );
  }

  const rows = (
    await Promise.all(items.map((item, i) => renderItem(item, i)))
  ).filter((node): node is ReactElement => node !== null);

  if (rows.length === 0) return null;

  return (
    <aside className="vp-rail-block">
      <h3 className="vp-rail__title">{label}</h3>
      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {rows}
      </ol>
    </aside>
  );
}

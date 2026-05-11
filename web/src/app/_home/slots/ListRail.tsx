import { StoryLink, categoryFor, type CardCtx, type HomeStory } from './_shared';
import type { SlotRow } from '../types';
import { HOME_EDITORIAL_TZ, timeShort } from '../../_homeShared';

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

export default function ListRail({ slot, ctx }: { slot: SlotRow; ctx: CardCtx }) {
  const stories = slot.items
    .map((i) => i.article)
    .filter((s): s is HomeStory => !!s)
    .slice(0, 5);
  if (stories.length === 0) return null;

  const label =
    typeof slot.config.label === 'string' ? slot.config.label : 'More stories';
  const numbered = slot.config.numbered === true;
  const showTimestamps = slot.config.timestamps === true;
  const railText = 'rgba(255,255,255,0.94)';
  const railSoft = 'rgba(255,255,255,0.72)';
  const railDim = 'rgba(255,255,255,0.54)';

  const railStyle: React.CSSProperties = numbered
    ? {}
    : ({ ['--rail-dot']: '#f2e7d6' } as React.CSSProperties);

  return (
    <aside className="vp-rail-block" style={railStyle}>
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
        {stories.map((story, idx) => {
          if (numbered) {
            const cat = categoryFor(story, ctx);
            const meta = [cat?.name, timeShort(story.published_at)]
              .filter(Boolean)
              .join(' · ');
            return (
              <li
                key={`${story.id}-${idx}`}
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
                key={`${story.id}-${idx}`}
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
            <li key={`${story.id}-${idx}`}>
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
        })}
      </ol>
    </aside>
  );
}

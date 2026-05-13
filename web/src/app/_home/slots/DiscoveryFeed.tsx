// Discovery feed — async server component. Each of the 4 placements is
// rendered via <SsrAdCell />, which handles resolve/impression/rewrite/
// beacon. Drops the whole .vp-rh-discovery wrapper when every cell is
// null.

import { Fragment } from 'react';
import type { CardCtx } from './_shared';
import type { SlotRow } from '../types';
import SsrAdCell from '../_SsrAdCell';

const PLACEMENTS = [
  'home_discovery_1',
  'home_discovery_2',
  'home_discovery_3',
  'home_discovery_4',
] as const;

export default async function DiscoveryFeed({}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const cells = await Promise.all(
    PLACEMENTS.map((p) =>
      SsrAdCell({
        placement: p,
        page: 'home',
        position: `discovery_feed:${p}`,
        wrapperClassName: 'discovery-cell',
        selector: `.discovery-cell[data-placement="${p}"]`,
        dataAttrs: { 'data-placement': p },
      }),
    ),
  );
  const liveIdx = cells
    .map((c, i) => (c !== null ? i : -1))
    .filter((i) => i >= 0);
  if (liveIdx.length === 0) return null;
  return (
    <div className="vp-rh-discovery">
      {liveIdx.map((i) => (
        <Fragment key={PLACEMENTS[i]}>{cells[i]}</Fragment>
      ))}
    </div>
  );
}

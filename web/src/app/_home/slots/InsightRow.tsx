// Insight row — async server component. Delegates the whole
// resolve-impression-rewrite-beacon dance to <SsrAdCell />; returns
// null when no eligible campaign so the wrapper is gone from the page.

import type { CardCtx } from './_shared';
import type { SlotRow } from '../types';
import SsrAdCell from '../_SsrAdCell';

export default async function InsightRow({}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  return (
    <SsrAdCell
      placement="home_insight_row"
      page="home"
      position="insight_row"
      wrapperClassName="vp-rh-insight"
    />
  );
}

// Data ticker — async server component. Renders editorial market-data
// items + a server-side resolved sponsor creative (if active). The
// sponsor cell is delegated to <SsrAdCell /> which handles impression
// logging, click rewrite, and viewability beacon. The wrapperClassName
// "item sponsor" makes the SsrAdCell's own <div> serve as the sponsor
// slot inside the .vp-rh-ticker rail — no extra wrapper.

import type { CardCtx } from './_shared';
import type { SlotRow } from '../types';
import SsrAdCell from '../_SsrAdCell';

type TickerItem = { label: string; value: string };

function isTickerItem(v: unknown): v is TickerItem {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.label === 'string' && typeof o.value === 'string';
}

export default async function DataTicker({
  slot,
}: {
  slot: SlotRow;
  ctx: CardCtx;
}) {
  const rawItems = Array.isArray(slot.config.items) ? slot.config.items : [];
  const items = rawItems.filter(isTickerItem);
  const sponsorCell = await SsrAdCell({
    placement: 'home_ticker_sponsor',
    page: 'home',
    position: 'data_ticker:home_ticker_sponsor',
    wrapperClassName: 'item sponsor',
    selector: '.vp-rh-ticker .sponsor',
  });

  if (items.length === 0 && !sponsorCell) return null;

  return (
    <div className="vp-rh-ticker">
      {items.map((it, i) => (
        <div className="item" key={i}>
          {it.label} <span>{it.value}</span>
        </div>
      ))}
      {sponsorCell}
    </div>
  );
}

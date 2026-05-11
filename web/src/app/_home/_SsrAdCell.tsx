// Server-side ad cell. Resolves a placement, logs an impression, rewrites
// the CTA href to the click-redirect endpoint, and mounts a viewability
// beacon. Renderer authors just emit <SsrAdCell ... /> and the rest is
// handled. Returns null if the ad is gated, the placement is empty, or
// the master toggle is off.

import AdBeacon from './_AdBeacon';
import { resolveAdAndLog, rewriteCreativeClickUrl } from './_adProbe';
import type { ReactElement } from 'react';

type Props = {
  placement: string;
  page: string;
  position: string;
  /** Wrapper className for the rendered creative. Used to scope the
   *  AdBeacon's IntersectionObserver to this cell, so per-page selectors
   *  don't collide if multiple SsrAdCells share a wrapper class. */
  wrapperClassName: string;
  /** Optional unique selector hint — when not provided, beacon uses
   *  `.${wrapperClassName}[data-ad-id="${impressionId}"]`. */
  selector?: string;
  /** Optional extra HTML attributes added to the wrapper for downstream
   *  layout hooks (e.g. data-placement="home_discovery_2"). */
  dataAttrs?: Record<string, string>;
  articleId?: string | null;
};

export default async function SsrAdCell({
  placement,
  page,
  position,
  wrapperClassName,
  selector,
  dataAttrs,
  articleId,
}: Props): Promise<ReactElement | null> {
  const result = await resolveAdAndLog(placement, {
    page,
    position,
    articleId: articleId ?? undefined,
  });
  if (!result?.ad?.creative_html) return null;
  const { ad, impressionId } = result;
  const html = impressionId
    ? rewriteCreativeClickUrl(
        ad.creative_html as string,
        impressionId,
        ad.click_url ?? '/signup',
      )
    : (ad.creative_html as string);

  const adId = impressionId ?? 'unbacked';
  // Default selector uses the FIRST class in wrapperClassName so multi-
  // class wrappers (e.g. "item sponsor") still produce a valid CSS
  // selector. Callers needing a custom hook pass `selector` explicitly.
  const firstClass = wrapperClassName.split(/\s+/)[0] || wrapperClassName;
  const effectiveSelector =
    selector ?? `.${firstClass}[data-ad-id="${adId}"]`;

  return (
    <>
      <div
        className={wrapperClassName}
        data-ad-id={adId}
        {...(dataAttrs ?? {})}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {impressionId && (
        <AdBeacon
          impressionId={impressionId}
          containerSelector={effectiveSelector}
        />
      )}
    </>
  );
}

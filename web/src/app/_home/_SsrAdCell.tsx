// Server-side ad cell. Resolves a placement, logs an impression, rewrites
// the CTA href to the click-redirect endpoint, and mounts a viewability
// beacon. Renderer authors just emit <SsrAdCell ... /> and the rest is
// handled. Returns null if the ad is gated, the placement is empty, or
// the master toggle is off.

import sanitizeHtml from 'sanitize-html';
import AdBeacon from './_AdBeacon';
import { resolveAdAndLog, rewriteCreativeClickUrl } from './_adProbe';
import type { ReactElement } from 'react';

// Ad creative sanitizer config. Allowlist derived from the live ad_units
// inventory: a/div/span/p/h3/h4/strong/em/b/i/br plus img/picture/source
// for future image creatives and button for future CTAs. Inline style is
// REQUIRED — every active creative uses it for layout/typography. NO
// class, NO data-*, NO event handlers, NO scripts/iframes/forms.
//
// sanitize-html (already installed; the repo's standard server-side
// sanitizer) — isomorphic-dompurify was previously removed due to a
// jsdom incompatibility under Vercel Node 20. See render-body.ts.
const AD_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'a', 'div', 'span', 'p', 'h3', 'h4', 'strong', 'em', 'b', 'i', 'br',
    'img', 'picture', 'source',
    'button',
  ],
  allowedAttributes: {
    a:       ['href', 'target', 'rel', 'style'],
    img:     ['src', 'srcset', 'alt', 'width', 'height', 'style'],
    source:  ['src', 'srcset', 'media', 'type'],
    picture: ['style'],
    button:  ['type', 'style'],
    '*':     ['style'],
  },
  allowedSchemes: ['http', 'https'],
  allowedSchemesByTag: {
    a:   ['http', 'https'],
    img: ['http', 'https', 'data'],
  },
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  allowedStyles: {
    '*': {
      'color':            [/^#(0x)?[0-9a-fA-F]+$/, /^rgba?\(/i, /^[a-zA-Z]+$/],
      'background':       [/^#(0x)?[0-9a-fA-F]+$/, /^rgba?\(/i, /^[a-zA-Z]+$/, /^linear-gradient\(/i, /^radial-gradient\(/i, /^repeating-linear-gradient\(/i, /^repeating-radial-gradient\(/i],
      'background-color': [/^#(0x)?[0-9a-fA-F]+$/, /^rgba?\(/i, /^[a-zA-Z]+$/],
      'display':          [/^(block|inline|inline-block|flex|inline-flex|grid|inline-grid|none)$/],
      'flex-direction':   [/^(row|column|row-reverse|column-reverse)$/],
      'justify-content':  [/^(flex-start|flex-end|center|space-between|space-around|space-evenly)$/],
      'align-items':      [/^(flex-start|flex-end|center|baseline|stretch)$/],
      'align-self':       [/^(auto|flex-start|flex-end|center|baseline|stretch)$/],
      'gap':              [/^\d+(\.\d+)?(px|em|rem|%)?$/],
      'grid-template-columns': [/^[\d\w\s.()%,-]+$/],
      'min-height':       [/^\d+(\.\d+)?(px|em|rem|%|vh)?$/],
      'height':           [/^(\d+(\.\d+)?(px|em|rem|%|vh)?|auto|100%)$/],
      'width':            [/^(\d+(\.\d+)?(px|em|rem|%|vw)?|auto|100%)$/],
      'max-width':        [/^(\d+(\.\d+)?(px|em|rem|%|vw)?|none)$/],
      'padding':          [/^[\d\s.pxemr%]+$/],
      'padding-top':      [/^(\d+(\.\d+)?(px|em|rem|%)?|0|auto)$/],
      'padding-right':    [/^(\d+(\.\d+)?(px|em|rem|%)?|0|auto)$/],
      'padding-bottom':   [/^(\d+(\.\d+)?(px|em|rem|%)?|0|auto)$/],
      'padding-left':     [/^(\d+(\.\d+)?(px|em|rem|%)?|0|auto)$/],
      'margin':           [/^[\d\s.pxemr%-]+$/],
      'margin-top':       [/^(-?\d+(\.\d+)?(px|em|rem|%)?|0|auto)$/],
      'margin-right':     [/^(-?\d+(\.\d+)?(px|em|rem|%)?|0|auto)$/],
      'margin-bottom':    [/^(-?\d+(\.\d+)?(px|em|rem|%)?|0|auto)$/],
      'margin-left':      [/^(-?\d+(\.\d+)?(px|em|rem|%)?|0|auto)$/],
      'border':           [/^[\d\s.pxemr%a-zA-Z#,()]+$/],
      'border-top':       [/^[\d\s.pxemr%a-zA-Z#,()]+$/],
      'border-right':     [/^[\d\s.pxemr%a-zA-Z#,()]+$/],
      'border-bottom':    [/^[\d\s.pxemr%a-zA-Z#,()]+$/],
      'border-left':      [/^[\d\s.pxemr%a-zA-Z#,()]+$/],
      'border-radius':    [/^[\d\s.pxemr%]+$/],
      'font':             [/^[^;{}]+$/],
      'font-family':      [/^[\w\s,'"-]+$/],
      'font-size':        [/^\d+(\.\d+)?(px|em|rem|%)?$/],
      'font-weight':      [/^(\d{3}|normal|bold|bolder|lighter)$/],
      'line-height':      [/^[\d.]+(px|em|rem|%)?$/],
      'letter-spacing':   [/^-?\d+(\.\d+)?(px|em|rem)?$/],
      'text-align':       [/^(left|right|center|justify|start|end)$/],
      'text-decoration':  [/^[\w\s-]+$/],
      'text-transform':   [/^(none|uppercase|lowercase|capitalize)$/],
      'opacity':          [/^[\d.]+$/],
      'overflow':         [/^(visible|hidden|scroll|auto)$/],
      // Future-proofing: common on production-style creatives even if not
      // in current inventory. Regexes restrict to safe value shapes.
      'box-shadow':       [/^[\d\s.pxemr%a-zA-Z#,()-]+$/],
      'text-shadow':      [/^[\d\s.pxemr%a-zA-Z#,()-]+$/],
      'white-space':      [/^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/],
      'cursor':           [/^(pointer|default|text|wait|crosshair|move|not-allowed|help|grab|grabbing)$/],
      'vertical-align':   [/^(baseline|top|middle|bottom|sub|super|text-top|text-bottom|-?\d+(\.\d+)?(px|em|rem|%)?)$/],
      'object-fit':       [/^(fill|contain|cover|none|scale-down)$/],
      'aspect-ratio':     [/^[\d./\s]+$/],
      'border-spacing':   [/^[\d\s.pxemr%]+$/],
    },
  },
  disallowedTagsMode: 'discard',
  // Force-merge rel="noopener noreferrer" onto any <a target="_blank">.
  transformTags: {
    a: (tagName, attribs) => {
      if (attribs.target === '_blank') {
        const existing = (attribs.rel ?? '').toLowerCase();
        const needed = ['noopener', 'noreferrer'].filter((r) => !existing.includes(r));
        const merged = [
          ...existing.split(/\s+/).filter(Boolean),
          ...needed,
        ].join(' ');
        return { tagName, attribs: { ...attribs, rel: merged } };
      }
      return { tagName, attribs };
    },
  },
};

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
  // Wave 4 — CLS guard. When nothing serves (no_fill, editorial_block, tier
  // hidden, sanitizer-stripped-to-empty), still emit the wrapper so the
  // home grid's `.vp-rh-card-ad` min-height reserves space. No impression
  // beacon — nothing was served, so there's nothing to log.
  const emptyCell = (
    <div
      className={wrapperClassName}
      data-ad-id="unfilled"
      {...(dataAttrs ?? {})}
    />
  );
  if (!result?.ad?.creative_html) return emptyCell;
  const { ad, impressionId } = result;
  // Step 1: rewrite the CTA href to the click-redirect endpoint.
  // Step 2: sanitize the rewritten HTML (must be the LAST step before
  // injection — defense-in-depth against compromised ads-table writes).
  const rewritten = impressionId
    ? rewriteCreativeClickUrl(
        ad.creative_html as string,
        impressionId,
        ad.click_url ?? '/signup',
      )
    : (ad.creative_html as string);
  const html = sanitizeHtml(rewritten, AD_SANITIZE_OPTIONS);
  if (!html.trim()) return emptyCell;

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

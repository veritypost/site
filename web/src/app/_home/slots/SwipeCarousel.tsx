'use client';

// Mobile swipe carousel — wraps a horizontal scroll-snap rail, adds
// pointer-drag for mouse/trackpad, and renders dot indicators that
// track the active card. Dots are always rendered (so SSR + hydration
// see the same DOM) and hidden on desktop via CSS when the rail isn't
// overflowing.

import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  cardSelector?: string;
};

export default function SwipeCarousel({
  children,
  className,
  cardSelector = ':scope > *',
}: Props) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const count = Children.count(children);

  const computeActive = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = rail.querySelectorAll<HTMLElement>(cardSelector);
    if (cards.length === 0) return;
    const center = rail.scrollLeft + rail.clientWidth / 2;
    let nearestIdx = 0;
    let nearestDist = Infinity;
    cards.forEach((card, i) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    });
    setActiveIdx(nearestIdx);
  }, [cardSelector]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener('scroll', computeActive, { passive: true });
    computeActive();
    return () => rail.removeEventListener('scroll', computeActive);
  }, [computeActive]);

  // Mouse/trackpad pointer-drag (touch already works via native scroll).
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let down = false;
    let startX = 0;
    let startScroll = 0;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      down = true;
      startX = e.clientX;
      startScroll = rail.scrollLeft;
      rail.setPointerCapture(e.pointerId);
      rail.classList.add('is-dragging');
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      rail.scrollLeft = startScroll - (e.clientX - startX);
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      rail.releasePointerCapture(e.pointerId);
      rail.classList.remove('is-dragging');
    };
    rail.addEventListener('pointerdown', onDown);
    rail.addEventListener('pointermove', onMove);
    rail.addEventListener('pointerup', onUp);
    rail.addEventListener('pointercancel', onUp);
    return () => {
      rail.removeEventListener('pointerdown', onDown);
      rail.removeEventListener('pointermove', onMove);
      rail.removeEventListener('pointerup', onUp);
      rail.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const goTo = (idx: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const cards = rail.querySelectorAll<HTMLElement>(cardSelector);
    const card = cards[idx];
    if (!card) return;
    rail.scrollTo({ left: card.offsetLeft, behavior: 'smooth' });
  };

  return (
    <div className="vp-swipe">
      <div ref={railRef} className={className}>
        {children}
      </div>
      {count > 1 && (
        <div className="vp-swipe__dots" role="tablist" aria-label="Stories">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === activeIdx}
              aria-label={`Story ${i + 1}`}
              onClick={() => goTo(i)}
              className={
                'vp-swipe__dot' + (i === activeIdx ? ' is-active' : '')
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

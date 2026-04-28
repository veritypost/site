// Focus trap for transient overlays (mobile drawer, modal dialogs).
//
// When `active` becomes true: focus the first focusable element inside `ref`
// and stash whatever had focus before. Tab / Shift+Tab cycle within the
// container instead of escaping to the page underneath. When `active` flips
// back to false, restore focus to the stashed element so keyboard users
// don't get dumped at the top of the page.

'use client';

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  options: { active: boolean }
): void {
  const { active } = options;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previouslyFocused =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;

    const focusables = (): HTMLElement[] =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );

    const first = focusables()[0];
    if (first) first.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (activeEl === firstEl || !node.contains(activeEl)) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (activeEl === lastEl || !node.contains(activeEl)) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [active, ref]);
}

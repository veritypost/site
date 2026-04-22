'use client';

import { useEffect, useRef } from 'react';

// Keyboard-focus trap for modal surfaces (WCAG 2.1 — 2.1.2 No Keyboard Trap
// and 2.4.3 Focus Order). On activation:
//   1. Records document.activeElement (the trigger) so focus can be
//      restored on close.
//   2. Focuses the first focusable descendant of containerRef.current,
//      or the container itself if it's tabindex-addressable (a modal panel
//      with no explicit focusable children still becomes reachable).
//   3. Listens for Tab / Shift+Tab on the container in the capture phase.
//      On the last focusable, Tab wraps to the first; on the first,
//      Shift+Tab wraps to the last.
//   4. Optional onEscape callback fires on the Escape key (a modal's
//      conventional close gesture).
// On deactivation (isActive flips to false, or unmount): restores focus
// to the recorded trigger element when it's still in the DOM.
//
// Used by: Interstitial, LockModal, kids/profile exit-PIN, messages
// new-message search overlay, story/[slug] regwall, story/[slug] report.

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useFocusTrap(isActive, containerRef, { onEscape } = {}) {
  // Stabilise the onEscape callback: callers typically pass a fresh arrow
  // each render, which would thrash the effect below and steal focus
  // mid-typing. The ref lets the effect run exactly once per activation.
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!isActive || typeof document === 'undefined') return undefined;
    const container = containerRef?.current;
    if (!container) return undefined;

    const trigger = document.activeElement;

    const focusables = () =>
      Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
      );

    const initial = focusables();
    if (initial.length > 0) {
      initial[0].focus();
    } else {
      if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
      container.focus();
    }

    function handleKeydown(e) {
      if (e.key === 'Escape') {
        const cb = onEscapeRef.current;
        if (cb) {
          e.preventDefault();
          cb();
        }
        return;
      }
      if (e.key !== 'Tab') return;

      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    container.addEventListener('keydown', handleKeydown);
    return () => {
      container.removeEventListener('keydown', handleKeydown);
      if (trigger && typeof trigger.focus === 'function' && document.contains(trigger)) {
        trigger.focus();
      }
    };
  }, [isActive, containerRef]);
}

// S7-F3 — /methodology folds into /editorial-standards#methodology.
//
// Per Q4.19 owner-lock: methodology is a section under editorial-standards,
// not a separate route, unless content depth justifies a split. Current
// content footprint fits under one heading, so this route redirects to
// the section anchor on /editorial-standards.
//
// The route exists so any external link to /methodology lands somewhere
// useful instead of 404; if content grows enough to warrant a split,
// replace this redirect with a full page export.

import { redirect } from 'next/navigation';

export default function MethodologyRedirect(): never {
  redirect('/editorial-standards#methodology');
}

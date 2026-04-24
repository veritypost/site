// Public profile by id — kill-switched while the surface is being
// cleaned up. The canonical route is /u/[username]; both are gated to
// "Under construction" until owner unhides. To re-enable, replace this
// file with the prior redirect-to-/u/[username] (see git history of
// commit ccffa86 for the redirect shape).
//
// Per CLAUDE.md kill-switch pattern: hide via gate, keep state +
// queries + types alive so unhide is one-line flip. This file goes
// further (full replace) because it was already a thin shim and there
// was no live state to preserve.

import UnderConstruction from '@/components/UnderConstruction';

export default function PublicProfileByIdUnderConstruction() {
  return <UnderConstruction surface="public profile" />;
}

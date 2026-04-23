/**
 * Stream 6 follow-up — Cluster detail page absorbed into Newsroom workspace
 *
 * The Phase 4 Task 21 cluster detail UI was rolled into expanded source
 * rows on /admin/newsroom (Stream 6 rewrite). Old bookmarks + the still-
 * standing "View" link on the workspace card land here and get redirected
 * to the workspace with the cluster id as a query param. Newsroom does
 * not yet act on `?cluster=:id` — harmless extra param; a later cleanup
 * pass can add scroll-into-view / highlight if useful.
 *
 * Server Component on purpose: redirect runs server-side so the browser
 * never paints the empty shell.
 */

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ClusterDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/admin/newsroom?cluster=${encodeURIComponent(params.id)}`);
}

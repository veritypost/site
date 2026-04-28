/**
 * Session C — /story/[slug] is now a thin server-side redirect to /<slug>.
 *
 * The 2400-line client reader that previously lived here has been
 * replaced by the new article-as-editor surface at /[slug]. This file
 * stays in place to preserve any cached link / external bookmark while
 * /story → /<slug> is the canonical path. Session E may delete it.
 */
import { redirect } from 'next/navigation';

export default function LegacyStorySlugRedirect({
  params,
}: {
  params: { slug: string };
}) {
  redirect(`/${params.slug}`);
}

'use client';

/**
 * Editor mode for /<slug>. Mounted only when the viewer has
 * articles.edit (server-determined). Mounts the full legacy
 * story-manager / kids-story-manager surface inline (Decision 10):
 * every editor field — headline, body, slug, category, sources,
 * timeline entries, quizzes — is reachable here without leaving the
 * article URL.
 *
 * Adult vs kids dispatch is by `age_band` with `is_kids_safe` as a
 * defensive fallback for legacy rows where age_band is NULL but the
 * row is marked kid-safe — those would otherwise fall through to the
 * adult editor (whose `body` field stays empty for kid rows whose
 * content lives in timeline entries):
 *   - kids | tweens                                 → KidsStoryEditor
 *   - is_kids_safe === true (any age_band)          → KidsStoryEditor
 *   - adult, or null age_band + not kid-safe        → StoryEditor
 *
 * The host /<slug>/page.tsx already supplies layout chrome, so each
 * editor mounts in `embedded` mode — no nested admin Page/PageHeader/
 * PageSection wrappers.
 */
import { useRouter } from 'next/navigation';
import StoryEditor from './StoryEditor';
import KidsStoryEditor from './KidsStoryEditor';
import type { ArticleSurfaceArticle } from './ArticleSurface';

export type ArticleEditorProps = {
  initialArticle: ArticleSurfaceArticle;
  initialBodyHtml: string;
  canPublish: boolean;
};

// `canPublish` is accepted for typing parity with ArticleSurface but
// not forwarded — story-manager owns the publish flow itself via the
// status column on its save form, which the server gates on
// admin.articles.edit.any (covers publish for the same actor set
// admin.articles.publish does in the legacy keys; the dual-check in
// /<slug>/page.tsx still controls editor visibility).
export default function ArticleEditor({ initialArticle }: ArticleEditorProps) {
  const router = useRouter();
  const band = initialArticle.age_band;
  const useKids = band === 'kids' || band === 'tweens' || initialArticle.is_kids_safe === true;

  // Adult/kids editors share the same prop signature. After a save the
  // editor reports back the persisted slug — the only way to know if
  // the slug edit changed the URL the user should be on. Refresh in
  // place for same-slug saves; redirect for renames.
  const handleArticleChange = (id: string | null, slug?: string | null) => {
    if (!id) {
      // Article was deleted from the embedded editor. Send the user
      // somewhere that exists; the newsroom is the canonical landing.
      router.push('/admin/newsroom?tab=articles');
      return;
    }
    if (slug && slug !== initialArticle.slug) {
      router.replace(`/${slug}`);
    } else {
      router.refresh();
    }
  };

  if (useKids) {
    return (
      <KidsStoryEditor
        articleId={initialArticle.id}
        onArticleChange={handleArticleChange}
        embedded
      />
    );
  }
  return (
    <StoryEditor
      articleId={initialArticle.id}
      onArticleChange={handleArticleChange}
      embedded
    />
  );
}

'use client';

/**
 * Thin wrapper around StoryEditor for the legacy /admin/story-manager
 * surface. The real editor lives in @/components/article/StoryEditor
 * and is shared with the article-as-editor surface at /<slug>.
 *
 * Suspense boundary is required because useSearchParams() suspends in
 * Next 14's app router during the static prerender pass.
 */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StoryEditor from '@/components/article/StoryEditor';
import Spinner from '@/components/admin/Spinner';

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get('article');
  return (
    <StoryEditor
      articleId={articleId}
      onArticleChange={(id) => {
        if (id) router.replace(`/admin/story-manager?article=${id}`);
        else router.replace('/admin/story-manager');
      }}
    />
  );
}

export default function StoryManagerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}><Spinner /></div>}>
      <Inner />
    </Suspense>
  );
}

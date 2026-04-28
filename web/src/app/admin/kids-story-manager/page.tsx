'use client';

/**
 * Thin wrapper around KidsStoryEditor for the legacy
 * /admin/kids-story-manager surface. The real editor lives in
 * @/components/article/KidsStoryEditor and is shared with the
 * article-as-editor surface at /<slug>.
 */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import KidsStoryEditor from '@/components/article/KidsStoryEditor';
import Spinner from '@/components/admin/Spinner';

function Inner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const articleId = searchParams.get('article');
  return (
    <KidsStoryEditor
      articleId={articleId}
      onArticleChange={(id) => {
        if (id) router.replace(`/admin/kids-story-manager?article=${id}`);
        else router.replace('/admin/kids-story-manager');
      }}
    />
  );
}

export default function KidsStoryManagerPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}><Spinner /></div>}>
      <Inner />
    </Suspense>
  );
}

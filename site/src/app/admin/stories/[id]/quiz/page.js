'use client';
import { useParams } from 'next/navigation';
import QuizPoolEditor from '@/components/QuizPoolEditor';

// Thin wrapper over the shared QuizPoolEditor component. The full-screen
// route stays available for deep-links from /admin/stories; the same
// component also renders inline under each story in
// /admin/story-manager via Pass 16 Task 136.
export default function QuizPoolPage() {
  const { id: articleId } = useParams();
  return <QuizPoolEditor articleId={articleId} />;
}

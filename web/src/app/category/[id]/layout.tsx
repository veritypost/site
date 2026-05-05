import type { Metadata } from 'next';
import { createClient } from '../../../lib/supabase/server';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const supabase = createClient();
  let { data } = await supabase.from('categories').select('name, description, is_kids_safe').eq('id', params.id).is('deleted_at', null).single();
  if (!data) {
    const { data: bySlug } = await supabase.from('categories').select('name, description, is_kids_safe').eq('slug', params.id).is('deleted_at', null).single();
    data = bySlug;
  }
  if (data?.is_kids_safe) {
    return { title: 'Verity Post Kids', robots: { index: false } };
  }
  const name = data?.name ?? 'Category';
  const description = data?.description ?? `Browse ${name} news on Verity Post.`;
  return {
    title: `${name} · Verity Post`,
    description,
    openGraph: { title: `${name} · Verity Post` },
  };
}

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

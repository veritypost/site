import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function ProfileByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient();

  const { data } = await supabase
    .from('public_profiles_v')
    .select('username')
    .eq('id', id)
    .maybeSingle();

  if (!data?.username) notFound();

  redirect(`/u/${data.username}`);
}

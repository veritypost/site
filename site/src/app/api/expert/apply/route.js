import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';

// POST /api/expert/apply
// Body: { application_type, full_name, organization, title, bio,
//         expertise_areas[], website_url, social_links, credentials,
//         portfolio_urls[], sample_responses[3], category_ids[] }
export async function POST(request) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }); }

  const b = await request.json().catch(() => ({}));
  const service = createServiceClient();
  const { data, error } = await service.rpc('submit_expert_application', {
    p_user_id: user.id,
    p_application_type: b.application_type,
    p_full_name: b.full_name,
    p_organization: b.organization || null,
    p_title: b.title || null,
    p_bio: b.bio || null,
    p_expertise_areas: b.expertise_areas || [],
    p_website_url: b.website_url || null,
    p_social_links: b.social_links || {},
    p_credentials: b.credentials || [],
    p_portfolio_urls: b.portfolio_urls || [],
    p_sample_responses: b.sample_responses || [],
    p_category_ids: b.category_ids || [],
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ application_id: data });
}

// @migrated-to-permissions 2026-04-18
// @feature-verified expert 2026-04-18
import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

// POST /api/expert/apply
// Body: { application_type, full_name, organization, title, bio,
//         expertise_areas[], website_url, social_links, credentials,
//         portfolio_urls[], sample_responses[3], category_ids[] }
export async function POST(request) {
  let user;
  try {
    user = await requirePermission('expert.application.apply');
  } catch (err) {
    if (err.status) {
      console.error('[expert.apply.permission]', err?.message || err);
      return NextResponse.json({ error: err.status === 401 ? 'Unauthenticated' : 'Forbidden' }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }

  const service = createServiceClient();

  // 5/hr per user — application review is manual; more than a handful an
  // hour is almost certainly abuse (and inflates the moderator queue).
  const rate = await checkRateLimit(service, {
    key: `expert-apply:user:${user.id}`,
    policyKey: 'expert_apply',
    max: 5,
    windowSec: 3600,
  });
  if (rate.limited) {
    return NextResponse.json(
      { error: 'Too many applications. Try again later.' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }

  const b = await request.json().catch(() => ({}));
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
  if (error) {
    console.error('[expert-apply] RPC failed:', error.message);
    return NextResponse.json({ error: 'Could not submit application.' }, { status: 400 });
  }
  return NextResponse.json({ application_id: data });
}

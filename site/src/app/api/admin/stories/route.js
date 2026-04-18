import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

export async function POST(request) {
  try {
    const supabase = await createClient();
    const user = await requireRole('editor', supabase);

    const body = await request.json();

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const slug = body.slug || body.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36);

    const { data: article, error } = await supabase
      .from('articles')
      .insert({
        title: body.title,
        slug,
        body: body.body || null,
        category_id: body.categoryId || null,
        author_id: user.id,
        status: body.status || 'draft',
        visibility: body.visibility || 'public',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Could not create article' }, { status: 500 });
    }

    return NextResponse.json({ article });
  } catch (err) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const supabase = await createClient();
    await requireRole('editor', supabase);

    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Article id is required' }, { status: 400 });
    }

    const updates = {};
    const allowed = ['title', 'slug', 'body', 'category_id', 'status', 'visibility'];
    for (const field of allowed) {
      const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (body[field] !== undefined) updates[field] = body[field];
      else if (body[camel] !== undefined) updates[field] = body[camel];
    }

    const { data: article, error } = await supabase
      .from('articles')
      .update(updates)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Could not update article' }, { status: 500 });
    }

    return NextResponse.json({ article });
  } catch (err) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const supabase = await createClient();
    await requireRole('admin', supabase);

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Article id is required' }, { status: 400 });
    }

    // Soft-delete
    const { error } = await supabase
      .from('articles')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: 'Could not delete article' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err.status) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

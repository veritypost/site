/**
 * Ext-X.7 — daily cleanup for the data-exports storage bucket.
 *
 * The user-facing signed URL on a data export is valid for 7 days; the
 * underlying object had no eviction. Storage cost grew unbounded and
 * old PII sat in private storage indefinitely past the user's promised
 * window.
 *
 * Strategy: list bucket objects, delete anything older than 14 days
 * (signed-URL expiry of 7 days + 7-day grace so a slow-poll user still
 * has an opportunity to re-issue). The object name in
 * process-data-exports is <user_id>/<request_id>.json so listing
 * straight from the bucket root with prefix='' is sufficient.
 *
 * Auth: standard cron auth (x-vercel-cron header OR CRON_SECRET bearer).
 * Best-effort + structured log on each delete failure.
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { verifyCronAuth } from '@/lib/cronAuth';
import { withCronLog } from '@/lib/cronLog';
import { logCronHeartbeat } from '@/lib/cronHeartbeat';

const CRON_NAME = 'cleanup-data-exports';
const BUCKET = 'data-exports';
const MAX_AGE_DAYS = 14;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

async function run(request: Request) {
  if (!verifyCronAuth(request).ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await logCronHeartbeat(CRON_NAME, 'start');

  const service = createServiceClient();
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let scanned = 0;
  let deleted = 0;
  let failed = 0;

  // Walk the bucket. Supabase storage list returns at most 100 by default;
  // page until empty. Listing with prefix='' returns user-id "folders"
  // (Supabase storage models prefix-as-folder); we descend one level.
  // For a launch-scale bucket (<100K objects) this completes in a few
  // seconds; if scale grows, switch to a date-prefixed object naming
  // scheme so list() can short-circuit.
  let folderOffset = 0;
  // Avoid infinite loops on a misbehaving storage backend.
  const MAX_FOLDER_PAGES = 100;
  const MAX_FILE_PAGES = 50;
  let folderPages = 0;
  while (folderPages < MAX_FOLDER_PAGES) {
    const { data: folders, error: folderErr } = await service.storage
      .from(BUCKET)
      .list('', { limit: 100, offset: folderOffset });
    if (folderErr) {
      console.error('[cron.cleanup-data-exports] folder list failed:', folderErr.message);
      await logCronHeartbeat(CRON_NAME, 'error', {
        stage: 'folder_list',
        error: folderErr.message,
      });
      return NextResponse.json({ ok: false, error: folderErr.message });
    }
    if (!folders || folders.length === 0) break;

    for (const folder of folders) {
      // Each "folder" here is a user-id prefix. List its files.
      let fileOffset = 0;
      let filePages = 0;
      while (filePages < MAX_FILE_PAGES) {
        const { data: files, error: fileErr } = await service.storage
          .from(BUCKET)
          .list(folder.name, { limit: 100, offset: fileOffset });
        if (fileErr) {
          console.error(
            '[cron.cleanup-data-exports] file list failed:',
            folder.name,
            fileErr.message
          );
          break;
        }
        if (!files || files.length === 0) break;

        const expiredPaths: string[] = [];
        for (const file of files) {
          scanned++;
          const createdAt = file.created_at ? Date.parse(file.created_at) : Date.now();
          if (createdAt < cutoff) {
            expiredPaths.push(`${folder.name}/${file.name}`);
          }
        }
        if (expiredPaths.length > 0) {
          const { error: rmErr } = await service.storage.from(BUCKET).remove(expiredPaths);
          if (rmErr) {
            console.error(
              '[cron.cleanup-data-exports] remove batch failed:',
              rmErr.message,
              expiredPaths.length
            );
            failed += expiredPaths.length;
          } else {
            deleted += expiredPaths.length;
          }
        }
        if (files.length < 100) break;
        fileOffset += 100;
        filePages++;
      }
    }
    if (folders.length < 100) break;
    folderOffset += 100;
    folderPages++;
  }

  await logCronHeartbeat(CRON_NAME, 'ok', { scanned, deleted, failed, max_age_days: MAX_AGE_DAYS });
  return NextResponse.json({ ok: true, scanned, deleted, failed, max_age_days: MAX_AGE_DAYS });
}

export const GET = withCronLog(CRON_NAME, run);

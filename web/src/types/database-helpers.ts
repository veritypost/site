// Typed helpers for working with the generated `Database` schema.
//
// These aliases keep call-sites short while still pulling the strict
// types through from `database.ts`. Regenerate that file with
// `npm run types:gen` after any DB migration.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

export type TableInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

export type TableUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type DbClient = SupabaseClient<Database>;

export type { Database };

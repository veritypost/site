# Duplicate / superseded migrations — DO NOT APPLY

These files are duplicates of the canonical `2026-04-27_S1_*.sql` set above this directory. The canonical files are the ones the session manual `Ongoing Projects/Sessions/Session_01_DB_Migrations.md` references in its item index. The 2026-04-28 versions were produced by a parallel autonomous run; their bodies are functionally equivalent (T0.2, T0.3, T0.5, T2.2, T2.7, T3.8) or slightly less correct (T2.3 — see below) than the canonical versions.

Moved here by V1 verification pass on 2026-04-28 so they're not in the apply path. CREATE OR REPLACE / ALTER POLICY are idempotent, so a double-apply against the live DB is technically safe but redundant; the move just removes the noise from `Ongoing Projects/migrations/` listings going forward.

## Pairs

| Item | Keeper (canonical) | Moved to _duplicates |
|---|---|---|
| T0.2 | `2026-04-27_S1_T0.2_post_comment_blocks_rename.sql` | `2026-04-28_S1_T0.2_post_comment_blocks_rename.sql` |
| T0.3 | `2026-04-27_S1_T0.3_drain_rpcs.sql` | `2026-04-28_S1_T0.3_drain_rpcs.sql` |
| T0.5 | `2026-04-27_S1_T0.5_current_kid_profile_id_top_level.sql` | `2026-04-28_S1_T0.5_current_kid_profile_id_top_level.sql` |
| T2.2 | `2026-04-27_S1_T2.2_anonymize_user_redact_content.sql` | `2026-04-28_S1_T2.2_anonymize_user_body_redact.sql` |
| T2.3 | `2026-04-27_S1_T2.3_comments_select_block_filter.sql` | `2026-04-28_S1_T2.3_comments_block_rls.sql` |
| T2.7 | `2026-04-27_S1_T2.7_billing_idempotency_advisory_lock.sql` | `2026-04-28_S1_T2.7_billing_idempotency.sql` |
| T3.8 | `2026-04-27_S1_T3.8_resolve_report_notify_reporter.sql` | `2026-04-28_S1_T3.8_resolve_report_notify_reporter.sql` |

## Why the canonical version wins each pair

- **T0.2 / T0.3 / T0.5 / T2.2 / T2.7 / T3.8** — bodies are functionally equivalent. The canonical file is what the session manual's item-index and cross-session dependency map points at, so we keep that one to keep references coherent.
- **T2.3** — canonical version places the block-list filter inside the `visible-and-not-author-and-not-mod` branch. The 2026-04-28 version made the filter a top-level AND, which would (a) hide moderators' view of comments authored by users they have blocked, and (b) hide the user's own comments if they ever appeared as `blocker_id=blocked_id` (impossible today, but the structure was wrong). Canonical keeps mod + own-comment visibility intact.

## Q3b set has no canonical 2026-04-27 parallel

`2026-04-28_S1_Q3b_*.sql` (4 files: users_rls_restrictive, weekly_recap_kid_block, events_partition_rls, rpc_kid_rejects) are NOT duplicates — they're the only Q3b DB-hardening migrations the session shipped. Apply them.

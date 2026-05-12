// Server-side urgent-priority allowlist for APNs dispatch.
//
// notifications.priority is a varchar that any code path writing to the
// notifications table can populate. To stop arbitrary call sites from
// declaring themselves "urgent" and breaking through Focus / Do Not Disturb,
// we enforce an allowlist of notification `type` values that are actually
// permitted to use the urgent channel.
//
// Mapping at dispatch (see send-push cron):
//   priority='urgent' AND type ∈ allowlist → apns-priority=10,
//                                            aps interruption-level='time-sensitive'
//   everything else                        → apns-priority=5,
//                                            aps interruption-level='active'
//   priority='urgent' AND type ∉ allowlist → downgraded to the second row,
//                                            warning logged, still delivered.
//
// 'critical' (Apple's most disruptive interruption level) is deliberately
// not used anywhere — requires the Critical Alerts entitlement, which we
// don't hold.

export const URGENT_TYPE_ALLOWLIST = new Set([
  'magic_link_code',
  'new_device_signin',
  'password_changed',
  'account_suspended',
  'parental_consent_required',
]);

// Pure mapper. Returns { priority, interruptionLevel, downgraded } where
// `downgraded === true` indicates the row asked for urgent but `type` was not
// on the allowlist — caller should log a warning and still send at priority=5.
export function resolvePushPriority(rowPriority, type) {
  if (rowPriority === 'urgent' && URGENT_TYPE_ALLOWLIST.has(type)) {
    return { priority: 10, interruptionLevel: 'time-sensitive', downgraded: false };
  }
  const downgraded = rowPriority === 'urgent';
  return { priority: 5, interruptionLevel: 'active', downgraded };
}

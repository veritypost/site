// Approval email template for closed-beta access requests.
// Plain HTML + text bodies. Single CTA: the unique invite link.

import { BRAND_NAME_LOWER } from './brand';

export type ApprovalEmailVars = {
  name: string;
  invite_url: string;
  expires_at: string; // human-readable
};

export const APPROVAL_TEMPLATE = {
  subject: `you're in — ${BRAND_NAME_LOWER}`,
  body_html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;margin-bottom:24px;">${BRAND_NAME_LOWER}</div>
    <p style="font-size:16px;line-height:1.65;color:#374151;margin:0 0 12px 0;">hi{{name_with_space}} &mdash;</p>
    <p style="font-size:16px;line-height:1.65;color:#374151;margin:0 0 20px 0;">we looked at your request and we&rsquo;re glad you applied. ${BRAND_NAME_LOWER} is a small thing we&rsquo;re building deliberately &mdash; news that earns your attention.</p>
    <p style="font-size:16px;line-height:1.65;color:#374151;margin:0 0 8px 0;">your invite link, good until {{expires_at}}:</p>
    <p style="margin:0 0 16px 0;"><a href="{{invite_url}}" style="color:#111111;font-weight:600;font-size:15px;text-decoration:underline;">sign up for ${BRAND_NAME_LOWER} &rarr;</a></p>
    <p style="font-size:12px;line-height:1.55;color:#9ca3af;word-break:break-all;font-family:ui-monospace,SFMono-Regular,monospace;margin:0 0 24px 0;">{{invite_url}}</p>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0 0 20px 0;">once you&rsquo;re in, you&rsquo;ll have two links of your own &mdash; for anyone you think should be here.</p>
    <p style="font-size:14px;line-height:1.55;color:#374151;margin:0;">&mdash; cliff at ${BRAND_NAME_LOWER}</p>
  </div>
</body></html>`,
  body_text: `${BRAND_NAME_LOWER}

hi{{name_with_space}} —

we looked at your request and we're glad you applied. ${BRAND_NAME_LOWER} is a small thing we're building deliberately — news that earns your attention.

your invite link, good until {{expires_at}}:
{{invite_url}}

once you're in, you'll have two links of your own — for anyone you think should be here.

— cliff at ${BRAND_NAME_LOWER}`,
  from_name: BRAND_NAME_LOWER,
  from_email: process.env.EMAIL_FROM || 'beta@veritypost.com',
};

export function buildApprovalVars(input: ApprovalEmailVars) {
  // Pre-format "name_with_space" so the email reads "Hi Cliff," when name
  // is present and "Hi," when it's blank — without conditional template
  // logic in the renderer.
  const trimmedName = (input.name || '').trim();
  const name_with_space = trimmedName ? ` ${trimmedName}` : '';
  return {
    name: trimmedName,
    name_with_space,
    invite_url: input.invite_url,
    expires_at: input.expires_at,
  };
}

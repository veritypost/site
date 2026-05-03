// Sign-in email template. Sent when a user requests a magic link.
// Follows the same pattern as betaApprovalEmail.ts — template object + vars builder.
// Q05: OTP-only email — no clickable link. URL prefetchers were burning tokens.

export type MagicLinkEmailVars = {
  email_otp: string;
  days_on_list?: number | null;
};

type TemplateVars = {
  email_otp: string;
  wait_line_html: string;
  wait_line_text: string;
};

export const MAGIC_LINK_TEMPLATE = {
  subject: 'your verity post sign-in code',
  body_html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;margin-bottom:24px;">VERITY POST</div>
    <p style="font-size:14px;line-height:1.55;color:#6b7280;margin:0 0 16px 0;">{{wait_line_html}}</p>
    <p style="font-size:16px;line-height:1.55;color:#374151;margin:0 0 24px 0;">enter this code on the sign-in screen. it works once and expires in 30 minutes.</p>
    <p style="font-size:36px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;letter-spacing:0.18em;color:#111111;margin:0 0 28px 0;">{{email_otp}}</p>
    <p style="font-size:12px;line-height:1.55;color:#9ca3af;margin:0;">if you didn&rsquo;t request this, you can ignore it.</p>
  </div>
</body></html>`,
  body_text: `VERITY POST

{{wait_line_text}}enter this code on the sign-in screen. it works once and expires in 30 minutes.

{{email_otp}}

if you didn't request this, you can ignore it.`,
  from_name: 'verity post',
  from_email: process.env.EMAIL_FROM || 'no-reply@veritypost.com',
};

export function buildMagicLinkVars(input: MagicLinkEmailVars): TemplateVars {
  const days = input.days_on_list;
  const hasWait = typeof days === 'number' && days >= 1;
  const dayWord = days === 1 ? 'day' : 'days';
  return {
    email_otp: input.email_otp,
    wait_line_html: hasWait ? `you've been on the list ${days} ${dayWord}.` : '',
    wait_line_text: hasWait ? `you've been on the list ${days} ${dayWord}.\n\n` : '',
  };
}

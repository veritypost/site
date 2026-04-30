// Sign-in email template. Sent when a user requests a magic link.
// Follows the same pattern as betaApprovalEmail.ts — template object + vars builder.

export type MagicLinkEmailVars = {
  action_link: string;
  email_otp: string;
  days_on_list?: number | null;
};

type TemplateVars = {
  action_link: string;
  email_otp: string;
  wait_line_html: string;
  wait_line_text: string;
};

export const MAGIC_LINK_TEMPLATE = {
  subject: 'your verity post link',
  body_html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;margin-bottom:24px;">VERITY POST</div>
    <p style="font-size:14px;line-height:1.55;color:#6b7280;margin:0 0 16px 0;">{{wait_line_html}}</p>
    <p style="font-size:16px;line-height:1.55;color:#374151;margin:0 0 24px 0;">tap the button to sign in. this link works once and expires in 30 minutes.</p>
    <div style="margin:0 0 24px 0;">
      <a href="{{action_link}}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#111111;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">sign in to verity post &rarr;</a>
    </div>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0 0 8px 0;">or enter this code on the sign-in screen:</p>
    <p style="font-size:28px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;letter-spacing:0.12em;color:#111111;margin:0 0 28px 0;">{{email_otp}}</p>
    <p style="font-size:12px;line-height:1.55;color:#9ca3af;margin:0;">if you didn&rsquo;t request this, you can ignore it.</p>
  </div>
</body></html>`,
  body_text: `VERITY POST

{{wait_line_text}}tap the button to sign in. this link works once and expires in 30 minutes.

{{action_link}}

or enter this code on the sign-in screen: {{email_otp}}

if you didn't request this, you can ignore it.`,
  from_name: 'verity post',
  from_email: process.env.EMAIL_FROM || 'no-reply@veritypost.com',
};

export function buildMagicLinkVars(input: MagicLinkEmailVars): TemplateVars {
  const days = input.days_on_list;
  const hasWait = typeof days === 'number' && days >= 1;
  const dayWord = days === 1 ? 'day' : 'days';
  return {
    action_link: input.action_link,
    email_otp: input.email_otp,
    wait_line_html: hasWait ? `you've been on the list ${days} ${dayWord}.` : '',
    wait_line_text: hasWait ? `you've been on the list ${days} ${dayWord}.\n\n` : '',
  };
}

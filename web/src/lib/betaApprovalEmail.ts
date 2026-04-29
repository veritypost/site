// Approval email template for closed-beta access requests.
// Plain HTML + text bodies. Single CTA: the unique invite link.

export type ApprovalEmailVars = {
  name: string;
  invite_url: string;
  expires_at: string; // human-readable
};

export const APPROVAL_TEMPLATE = {
  subject: "you're in — verity post",
  body_html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">verity post</div>
    <h1 style="font-size:24px;font-weight:800;line-height:1.2;margin:0 0 16px 0;">you&rsquo;re in.</h1>
    <p style="font-size:16px;line-height:1.55;color:#374151;margin:0 0 20px 0;">
      hi{{name_with_space}} &mdash; we reviewed your request and you&rsquo;re approved. welcome.
    </p>
    <p style="font-size:16px;line-height:1.55;color:#374151;margin:0 0 24px 0;">
      tap the button below to sign up. this link is personal, good for one account, and expires on {{expires_at}}.
    </p>
    <div style="margin:0 0 24px 0;">
      <a href="{{invite_url}}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#111111;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">sign up →</a>
    </div>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0 0 8px 0;">or paste this into your browser:</p>
    <p style="font-size:13px;line-height:1.55;color:#374151;word-break:break-all;font-family:ui-monospace,SFMono-Regular,monospace;margin:0 0 28px 0;">{{invite_url}}</p>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0 0 4px 0;">
      once you&rsquo;re in, you&rsquo;ll get two invite links of your own &mdash; for anyone you think should be here.
    </p>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0;">
      &mdash; cliff at verity post
    </p>
  </div>
</body></html>`,
  body_text: `verity post

you're in.

hi{{name_with_space}} — we reviewed your request and you're approved. welcome.

tap the link below to sign up. it's personal, good for one account, and expires on {{expires_at}}.

{{invite_url}}

once you're in, you'll get two invite links of your own — for anyone you think should be here.

— cliff at verity post`,
  from_name: 'verity post',
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

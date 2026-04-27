// Approval email template for closed-beta access requests.
// Plain HTML + text bodies. Single CTA: the unique invite link.

export type ApprovalEmailVars = {
  name: string;
  invite_url: string;
  expires_at: string; // human-readable
};

export const APPROVAL_TEMPLATE = {
  subject: "You're approved for the Verity Post beta",
  body_html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">Verity Post</div>
    <h1 style="font-size:24px;font-weight:800;line-height:1.2;margin:0 0 16px 0;">You&rsquo;re in.</h1>
    <p style="font-size:16px;line-height:1.55;color:#374151;margin:0 0 16px 0;">
      Hi{{name_with_space}}, thanks for requesting access to the Verity Post beta. You&rsquo;re approved.
    </p>
    <p style="font-size:16px;line-height:1.55;color:#374151;margin:0 0 24px 0;">
      Your invite link is below. It&rsquo;s good for one signup and expires on {{expires_at}}.
    </p>
    <div style="margin:0 0 24px 0;">
      <a href="{{invite_url}}" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#111111;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">Sign up with my invite</a>
    </div>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0 0 8px 0;">Or copy this URL into a browser:</p>
    <p style="font-size:13px;line-height:1.55;color:#374151;word-break:break-all;font-family:ui-monospace,SFMono-Regular,monospace;margin:0 0 24px 0;">{{invite_url}}</p>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0 0 0 0;">
      Once you&rsquo;re in, you&rsquo;ll get two share links of your own — for friends or anyone you think should be here.
    </p>
  </div>
</body></html>`,
  body_text: `Verity Post — You're in.

Hi{{name_with_space}}, thanks for requesting access to the Verity Post beta. You're approved.

Your invite link is below. It's good for one signup and expires on {{expires_at}}.

{{invite_url}}

Once you're in, you'll get two share links of your own — for friends or anyone you think should be here.`,
  from_name: 'Verity Post',
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

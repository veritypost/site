// Email-confirm template for /request-access. Sent BEFORE admin review.
// User must click the confirm link to prove they own the inbox; only
// then does the request enter the admin queue.

export type ConfirmEmailVars = {
  confirm_url: string;
  expires_at: string; // human-readable
};

export const REQUEST_CONFIRM_TEMPLATE = {
  subject: 'Confirm your email — verity post beta access',
  body_html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">verity post</div>
    <h1 style="font-size:22px;font-weight:800;line-height:1.25;margin:0 0 14px 0;">Confirm your email</h1>
    <p style="font-size:15px;line-height:1.55;color:#374151;margin:0 0 16px 0;">
      You requested access to the verity post beta. Click the button below to confirm this is your email — that&rsquo;s when your request goes to the team for review.
    </p>
    <div style="margin:0 0 22px 0;">
      <a href="{{confirm_url}}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#111111;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none;">Confirm my email</a>
    </div>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0 0 8px 0;">Or copy this URL into a browser:</p>
    <p style="font-size:13px;line-height:1.55;color:#374151;word-break:break-all;font-family:ui-monospace,SFMono-Regular,monospace;margin:0 0 22px 0;">{{confirm_url}}</p>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0;">
      The link expires on {{expires_at}}. If you didn&rsquo;t request access, you can ignore this email — nothing happens unless you click.
    </p>
  </div>
</body></html>`,
  body_text: `verity post — Confirm your email.

You requested access to the verity post beta. Click the link below to confirm this is your email — that's when your request goes to the team for review.

{{confirm_url}}

The link expires on {{expires_at}}. If you didn't request access, you can ignore this email — nothing happens unless you click.`,
  from_name: 'verity post',
  from_email: process.env.EMAIL_FROM || 'beta@veritypost.com',
};

// Waitlist confirmation email — sent immediately when someone joins the list.

const FROM_EMAIL = process.env.EMAIL_FROM || 'beta@veritypost.com';

export const WAITLIST_TEMPLATE = {
  subject: "you're on the list — verity post",
  from_name: 'verity post',
  from_email: FROM_EMAIL,
  body_html: `<!doctype html>
<html><body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#6b7280;margin-bottom:16px;">verity post</div>
    <h1 style="font-size:24px;font-weight:800;line-height:1.2;margin:0 0 16px 0;">you&rsquo;re on the list.</h1>
    <p style="font-size:16px;line-height:1.55;color:#374151;margin:0 0 20px 0;">
      hi{{name_with_space}} &mdash; we&rsquo;ve got your spot. we&rsquo;ll email you at this address when it&rsquo;s your turn.
    </p>
    <p style="font-size:16px;line-height:1.55;color:#374151;margin:0 0 28px 0;">
      in the meantime, if someone you know is already on verity post, their personal invite link skips the line entirely.
    </p>
    <p style="font-size:13px;line-height:1.55;color:#6b7280;margin:0;">
      &mdash; cliff at verity post
    </p>
  </div>
</body></html>`,
  body_text: `verity post

you're on the list.

hi{{name_with_space}} — we've got your spot. we'll email you at this address when it's your turn.

in the meantime, if someone you know is already on verity post, their personal invite link skips the line entirely.

— cliff at verity post`,
};

export function buildWaitlistVars(name: string | null) {
  const trimmed = (name || '').trim();
  return { name_with_space: trimmed ? ` ${trimmed}` : '' };
}

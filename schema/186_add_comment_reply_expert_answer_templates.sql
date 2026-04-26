-- T-134 + T-135: Add comment_reply and expert_answer_posted email templates.
-- These feed the send-emails cron via TYPE_TO_TEMPLATE. Template variables
-- follow the same convention as existing templates: {{username}}, {{body}},
-- {{action_url}}, {{title}} interpolated by renderTemplate() in lib/email.

INSERT INTO public.email_templates (key, name, subject, body_html, body_text, variables, is_active)
VALUES
  (
    'comment_reply',
    'Comment Reply',
    'Someone replied to your comment',
    '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Someone replied to your comment</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
<h2 style="font-size:18px;font-weight:600;margin-bottom:8px;">Someone replied to your comment</h2>
<p style="margin-bottom:16px;">Hi {{username}},</p>
<p style="margin-bottom:16px;">{{body}}</p>
<p style="margin-bottom:24px;"><a href="{{action_url}}" style="background:#1a1a1a;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">View reply</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
<p style="font-size:12px;color:#666;">You received this because you have reply notifications enabled. <a href="{{site_url}}/profile/settings#notifications">Manage preferences</a></p>
</body>
</html>',
    'Hi {{username}},

Someone replied to your comment.

{{body}}

View the reply: {{action_url}}

---
You received this because you have reply notifications enabled.
Manage preferences: {{site_url}}/profile/settings#notifications',
    '["username","body","action_url","site_url"]'::jsonb,
    true
  ),
  (
    'expert_answer_posted',
    'Expert Answer Posted',
    'Your question has been answered by an expert',
    '<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your question has been answered by an expert</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
<h2 style="font-size:18px;font-weight:600;margin-bottom:8px;">An expert answered your question</h2>
<p style="margin-bottom:16px;">Hi {{username}},</p>
<p style="margin-bottom:16px;">A verified expert has answered your question.</p>
<p style="margin-bottom:16px;">{{body}}</p>
<p style="margin-bottom:24px;"><a href="{{action_url}}" style="background:#1a1a1a;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;display:inline-block;">Read the answer</a></p>
<hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
<p style="font-size:12px;color:#666;">You received this because you have expert answer notifications enabled. <a href="{{site_url}}/profile/settings#notifications">Manage preferences</a></p>
</body>
</html>',
    'Hi {{username}},

A verified expert has answered your question.

{{body}}

Read the answer: {{action_url}}

---
You received this because you have expert answer notifications enabled.
Manage preferences: {{site_url}}/profile/settings#notifications',
    '["username","body","action_url","site_url"]'::jsonb,
    true
  )
ON CONFLICT (key) DO NOTHING;

-- Verification: should return 2 rows with is_active=true
-- SELECT key, name, subject, is_active FROM public.email_templates
-- WHERE key IN ('comment_reply', 'expert_answer_posted');

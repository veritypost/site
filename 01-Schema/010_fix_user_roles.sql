-- Fix missing user_roles for test accounts
-- Run in Supabase SQL Editor (bypasses RLS)

-- Owner
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username = 'test_owner' AND r.name = 'owner'
ON CONFLICT DO NOTHING;

-- Superadmin
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username = 'test_superadmin' AND r.name = 'superadmin'
ON CONFLICT DO NOTHING;

-- Admin
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username = 'test_admin' AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Editor
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username = 'test_editor' AND r.name = 'editor'
ON CONFLICT DO NOTHING;

-- Moderator
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username = 'test_moderator' AND r.name = 'moderator'
ON CONFLICT DO NOTHING;

-- Expert
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username = 'test_expert' AND r.name = 'expert'
ON CONFLICT DO NOTHING;

-- Educator
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username = 'test_educator' AND r.name = 'educator'
ON CONFLICT DO NOTHING;

-- Journalist
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username = 'test_journalist' AND r.name = 'journalist'
ON CONFLICT DO NOTHING;

-- Give ALL test users the base 'user' role too
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username LIKE 'test_%' AND r.name = 'user'
ON CONFLICT DO NOTHING;

-- Give ALL community users the 'user' role
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT u.id, r.id, u.id
FROM users u, roles r
WHERE u.username LIKE '%_reads' OR u.username LIKE '%_writes' OR u.username LIKE '%_thinks'
   OR u.username LIKE '%_explores' OR u.username LIKE '%_learns' OR u.username LIKE '%_discovers'
   OR u.username LIKE '%_reports' OR u.username LIKE '%_shares' OR u.username LIKE '%_watches'
   OR u.username LIKE '%_studies'
AND r.name = 'user'
ON CONFLICT DO NOTHING;

-- Verify
SELECT u.username, r.name as role
FROM user_roles ur
JOIN users u ON u.id = ur.user_id
JOIN roles r ON r.id = ur.role_id
ORDER BY u.username;

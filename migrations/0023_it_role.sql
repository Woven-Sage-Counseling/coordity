-- IT role for technical staff who help maintain the portal.

INSERT OR IGNORE INTO "role" ("id", "key", "name", "description") VALUES
  (
    'role_it',
    'it',
    'IT',
    'Technical staff who maintain portal integrations and support internal tools'
  );

INSERT OR IGNORE INTO "role_permission" ("role_id", "permission_id") VALUES
  ('role_it', 'perm_portal_access'),
  ('role_it', 'perm_account_view'),
  ('role_it', 'perm_resources_view'),
  ('role_it', 'perm_apps_management'),
  ('role_it', 'perm_employees_view');

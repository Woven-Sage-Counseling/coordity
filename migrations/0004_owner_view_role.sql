-- Primary owner vs view-only owner, and a read-only people permission.

UPDATE "role"
SET "name" = 'Primary owner',
    "description" = 'Full control of the portal, people, and financial connections'
WHERE "id" = 'role_owner';

INSERT OR IGNORE INTO "role" ("id", "key", "name", "description") VALUES
  (
    'role_owner_view',
    'owner_view',
    'Owner',
    'Can see every tool and dashboard, but cannot change people, settings, or QuickBooks'
  );

INSERT OR IGNORE INTO "permission" ("id", "key", "description") VALUES
  ('perm_employees_view', 'employees:view', 'View registered users and roles');

INSERT OR IGNORE INTO "role_permission" ("role_id", "permission_id") VALUES
  ('role_owner', 'perm_employees_view'),
  ('role_owner_view', 'perm_portal_access'),
  ('role_owner_view', 'perm_account_view'),
  ('role_owner_view', 'perm_resources_view'),
  ('role_owner_view', 'perm_apps_clinical'),
  ('role_owner_view', 'perm_apps_management'),
  ('role_owner_view', 'perm_financials_view'),
  ('role_owner_view', 'perm_employees_view');

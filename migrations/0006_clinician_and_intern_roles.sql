-- Split general Employee from Clinician, and add Intern.

UPDATE "role"
SET "name" = 'Employee',
    "description" = 'General staff access to the portal and employee resources, without clinical tools'
WHERE "id" = 'role_employee';

DELETE FROM "role_permission"
WHERE "role_id" = 'role_employee'
  AND "permission_id" = 'perm_apps_clinical';

INSERT OR IGNORE INTO "role" ("id", "key", "name", "description") VALUES
  (
    'role_clinician',
    'clinician',
    'Clinician',
    'Therapist and clinician access including clinical and billing tools'
  ),
  (
    'role_intern',
    'intern',
    'Intern',
    'Supervised intern access to the portal, resources, and clinical tools'
  );

INSERT OR IGNORE INTO "role_permission" ("role_id", "permission_id") VALUES
  ('role_clinician', 'perm_portal_access'),
  ('role_clinician', 'perm_account_view'),
  ('role_clinician', 'perm_resources_view'),
  ('role_clinician', 'perm_apps_clinical'),
  ('role_intern', 'perm_portal_access'),
  ('role_intern', 'perm_account_view'),
  ('role_intern', 'perm_resources_view'),
  ('role_intern', 'perm_apps_clinical');

-- Existing people on the old Employee/Therapist role become Clinicians.
UPDATE "user_role"
SET "role_id" = 'role_clinician'
WHERE "role_id" = 'role_employee';

UPDATE "invitation"
SET "role_id" = 'role_clinician'
WHERE "role_id" = 'role_employee'
  AND "status" = 'pending';

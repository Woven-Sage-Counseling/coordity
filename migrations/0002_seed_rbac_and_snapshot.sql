-- RBAC seed + cash-basis P&L snapshot for Jan 1–Aug 17, 2026.
-- Cash balances stay NULL until real bank figures are provided.

INSERT OR IGNORE INTO "role" ("id", "key", "name", "description") VALUES
  ('role_owner', 'owner', 'Owner / Admin', 'Complete portal access, employee administration, and financials'),
  ('role_finance', 'finance', 'Finance', 'Financial dashboard access'),
  ('role_manager', 'manager', 'Manager', 'Approved management resources'),
  ('role_employee', 'employee', 'Employee / Therapist', 'General employee resources');

INSERT OR IGNORE INTO "permission" ("id", "key", "description") VALUES
  ('perm_portal_access', 'portal:access', 'Sign in to the employee portal'),
  ('perm_account_view', 'account:view', 'View own account profile'),
  ('perm_resources_view', 'resources:view', 'View employee resources'),
  ('perm_resources_manage', 'resources:manage', 'Manage employee resources'),
  ('perm_apps_clinical', 'apps:clinical', 'Open clinical tools such as SimplePractice'),
  ('perm_apps_management', 'apps:management', 'Open approved management tools'),
  ('perm_financials_view', 'financials:view', 'View financial dashboard data'),
  ('perm_financials_manage', 'financials:manage', 'Connect QuickBooks and manage financial sources'),
  ('perm_employees_manage', 'employees:manage', 'Invite, disable, and assign roles');

-- Owner: all permissions
INSERT OR IGNORE INTO "role_permission" ("role_id", "permission_id")
SELECT 'role_owner', "id" FROM "permission";

-- Finance
INSERT OR IGNORE INTO "role_permission" ("role_id", "permission_id") VALUES
  ('role_finance', 'perm_portal_access'),
  ('role_finance', 'perm_account_view'),
  ('role_finance', 'perm_resources_view'),
  ('role_finance', 'perm_apps_clinical'),
  ('role_finance', 'perm_financials_view');

-- Manager
INSERT OR IGNORE INTO "role_permission" ("role_id", "permission_id") VALUES
  ('role_manager', 'perm_portal_access'),
  ('role_manager', 'perm_account_view'),
  ('role_manager', 'perm_resources_view'),
  ('role_manager', 'perm_apps_clinical'),
  ('role_manager', 'perm_apps_management');

-- Employee / therapist
INSERT OR IGNORE INTO "role_permission" ("role_id", "permission_id") VALUES
  ('role_employee', 'perm_portal_access'),
  ('role_employee', 'perm_account_view'),
  ('role_employee', 'perm_resources_view'),
  ('role_employee', 'perm_apps_clinical');

INSERT OR IGNORE INTO "financial_snapshot" (
  "id",
  "source",
  "accounting_method",
  "period_start",
  "period_end",
  "revenue_cents",
  "therapist_compensation_cents",
  "management_compensation_cents",
  "software_and_technology_cents",
  "total_expenses_cents",
  "net_income_cents",
  "created_at",
  "notes"
) VALUES (
  'snap_2026_ytd_aug17',
  'manual',
  'cash',
  '2026-01-01',
  '2026-08-17',
  508823,
  347821,
  128778,
  23966,
  500565,
  8258,
  1771473600000,
  'Cash-basis QuickBooks figures entered manually for portal preview. Replace via QuickBooks OAuth sync when connected.'
);

INSERT OR IGNORE INTO "cash_account_balance" ("account_key", "label", "balance_cents", "as_of_date", "updated_at") VALUES
  ('relay_operating', 'Relay operating cash', NULL, NULL, NULL),
  ('boa_reserve', 'Bank of America reserve', NULL, NULL, NULL);

INSERT OR IGNORE INTO "reserve_setting" ("id", "target_months", "notes") VALUES
  (1, 3, 'Target is 3 months of average revenue for the current reporting period.');

INSERT OR IGNORE INTO "quickbooks_connection" ("id", "status") VALUES
  ('default', 'disconnected');

-- Sub-administrator: same reach as ADMIN except hospital configuration and
-- administrator accounts.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUBADMIN';

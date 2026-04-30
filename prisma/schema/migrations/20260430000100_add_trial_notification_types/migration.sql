-- AlterEnum: trial notification types must be in their own migration because
-- PostgreSQL `ALTER TYPE ... ADD VALUE` cannot run inside a transaction
-- alongside other DDL statements.
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_TRIAL_ENDING_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'BILLING_TRIAL_EXPIRED';

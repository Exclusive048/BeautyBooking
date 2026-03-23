-- Drop legacy schedule runtime tables after unified schedule migration.
DROP TABLE IF EXISTS "ScheduleBlock" CASCADE;
DROP TABLE IF EXISTS "ScheduleRule" CASCADE;
DROP TABLE IF EXISTS "WeeklySchedule" CASCADE;
DROP TABLE IF EXISTS "WorkDayRule" CASCADE;
DROP TABLE IF EXISTS "WorkException" CASCADE;
DROP TABLE IF EXISTS "WorkShiftTemplate" CASCADE;

-- Drop enums that were only used by removed legacy tables.
DROP TYPE IF EXISTS "ScheduleRuleKind";
DROP TYPE IF EXISTS "WorkExceptionType";

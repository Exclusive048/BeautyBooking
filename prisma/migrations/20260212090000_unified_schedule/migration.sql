-- Add TEMPLATE value to ScheduleOverrideKind
ALTER TYPE "ScheduleOverrideKind" ADD VALUE IF NOT EXISTS 'TEMPLATE';

-- Create ScheduleTemplate
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleTemplate_providerId_idx" ON "ScheduleTemplate"("providerId");
CREATE UNIQUE INDEX "ScheduleTemplate_providerId_name_key" ON "ScheduleTemplate"("providerId", "name");

ALTER TABLE "ScheduleTemplate" ADD CONSTRAINT "ScheduleTemplate_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create ScheduleTemplateBreak
CREATE TABLE "ScheduleTemplateBreak" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScheduleTemplateBreak_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduleTemplateBreak_templateId_idx" ON "ScheduleTemplateBreak"("templateId");

ALTER TABLE "ScheduleTemplateBreak" ADD CONSTRAINT "ScheduleTemplateBreak_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create WeeklyScheduleConfig
CREATE TABLE "WeeklyScheduleConfig" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyScheduleConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyScheduleConfig_providerId_key" ON "WeeklyScheduleConfig"("providerId");

ALTER TABLE "WeeklyScheduleConfig" ADD CONSTRAINT "WeeklyScheduleConfig_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create WeeklyScheduleDay
CREATE TABLE "WeeklyScheduleDay" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "templateId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WeeklyScheduleDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyScheduleDay_configId_weekday_key" ON "WeeklyScheduleDay"("configId", "weekday");
CREATE INDEX "WeeklyScheduleDay_templateId_idx" ON "WeeklyScheduleDay"("templateId");

ALTER TABLE "WeeklyScheduleDay" ADD CONSTRAINT "WeeklyScheduleDay_configId_fkey" FOREIGN KEY ("configId") REFERENCES "WeeklyScheduleConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyScheduleDay" ADD CONSTRAINT "WeeklyScheduleDay_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Alter ScheduleOverride
ALTER TABLE "ScheduleOverride" ADD COLUMN "templateId" TEXT;
ALTER TABLE "ScheduleOverride" ADD COLUMN "isActive" BOOLEAN;

CREATE INDEX "ScheduleOverride_templateId_idx" ON "ScheduleOverride"("templateId");

ALTER TABLE "ScheduleOverride" ADD CONSTRAINT "ScheduleOverride_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScheduleTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Alter ScheduleChangeRequest
ALTER TABLE "ScheduleChangeRequest" ADD COLUMN "providerId" TEXT;
ALTER TABLE "ScheduleChangeRequest" ADD COLUMN "comment" TEXT;
ALTER TABLE "ScheduleChangeRequest" ALTER COLUMN "studioId" DROP NOT NULL;
ALTER TABLE "ScheduleChangeRequest" ALTER COLUMN "payloadJson" TYPE JSONB USING "payloadJson"::jsonb;

UPDATE "ScheduleChangeRequest" SET "providerId" = "masterId" WHERE "providerId" IS NULL;
ALTER TABLE "ScheduleChangeRequest" ALTER COLUMN "providerId" SET NOT NULL;

CREATE INDEX "ScheduleChangeRequest_providerId_status_createdAt_idx" ON "ScheduleChangeRequest"("providerId", "status", "createdAt");
CREATE INDEX "ScheduleChangeRequest_studioId_status_createdAt_idx" ON "ScheduleChangeRequest"("studioId", "status", "createdAt");

ALTER TABLE "ScheduleChangeRequest" ADD CONSTRAINT "ScheduleChangeRequest_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the column `accountType` on the `UserProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UserProfile" DROP COLUMN "accountType",
ADD COLUMN     "roles" "AccountType"[] DEFAULT ARRAY['CLIENT']::"AccountType"[];

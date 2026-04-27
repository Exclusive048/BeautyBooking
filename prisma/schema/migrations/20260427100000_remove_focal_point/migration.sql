-- Remove focal point fields from MediaAsset, Provider, and UserProfile
-- Focal point functionality was replaced by crop-based positioning (cropX/Y/Width/Height)

ALTER TABLE "MediaAsset" DROP COLUMN IF EXISTS "focalX";
ALTER TABLE "MediaAsset" DROP COLUMN IF EXISTS "focalY";

ALTER TABLE "Provider" DROP COLUMN IF EXISTS "avatarFocalX";
ALTER TABLE "Provider" DROP COLUMN IF EXISTS "avatarFocalY";
ALTER TABLE "Provider" DROP COLUMN IF EXISTS "bannerFocalX";
ALTER TABLE "Provider" DROP COLUMN IF EXISTS "bannerFocalY";

ALTER TABLE "UserProfile" DROP COLUMN IF EXISTS "avatarFocalX";
ALTER TABLE "UserProfile" DROP COLUMN IF EXISTS "avatarFocalY";

-- CreateIndex
CREATE INDEX "DiscountRule_isEnabled_idx" ON "DiscountRule"("isEnabled");

-- CreateIndex
CREATE INDEX "GlobalCategory_status_visibleToAll_isSystem_name_idx" ON "GlobalCategory"("status", "visibleToAll", "isSystem", "name");

-- CreateIndex
CREATE INDEX "MasterService_masterProviderId_isEnabled_idx" ON "MasterService"("masterProviderId", "isEnabled");

-- CreateIndex
CREATE INDEX "MasterService_serviceId_isEnabled_idx" ON "MasterService"("serviceId", "isEnabled");

-- CreateIndex
CREATE INDEX "ModelOffer_status_dateLocal_timeRangeStartLocal_createdAt_i_idx" ON "ModelOffer"("status", "dateLocal", "timeRangeStartLocal", "createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "Provider_isPublished_rating_reviews_idx" ON "Provider"("isPublished", "rating" DESC, "reviews" DESC);

-- CreateIndex
CREATE INDEX "Provider_isPublished_ratingAvg_reviews_createdAt_idx" ON "Provider"("isPublished", "ratingAvg" DESC, "reviews" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Provider_studioId_type_isPublished_createdAt_idx" ON "Provider"("studioId", "type", "isPublished", "createdAt");

-- CreateIndex
CREATE INDEX "Provider_type_isPublished_address_idx" ON "Provider"("type", "isPublished", "address");

-- CreateIndex
CREATE INDEX "Service_providerId_isEnabled_isActive_idx" ON "Service"("providerId", "isEnabled", "isActive");

-- CreateIndex
CREATE INDEX "Service_globalCategoryId_isEnabled_isActive_idx" ON "Service"("globalCategoryId", "isEnabled", "isActive");

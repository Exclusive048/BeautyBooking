type SchemaObject = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  properties?: Record<string, SchemaObject>;
  required?: readonly string[];
  items?: SchemaObject;
  enum?: readonly (string | number | boolean)[];
  format?: string;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  description?: string;
  nullable?: boolean;
  oneOf?: SchemaObject[];
  allOf?: SchemaObject[];
  $ref?: string;
  additionalProperties?: boolean | SchemaObject;
};

type ParameterObject = {
  name: string;
  in: "path" | "query";
  required?: boolean;
  schema: SchemaObject;
  description?: string;
};

type RequestBodyObject = {
  required?: boolean;
  content: Record<string, { schema: SchemaObject }>;
};

type ResponseObject = {
  description: string;
  content?: {
    "application/json": {
      schema: SchemaObject;
    };
  };
};

type OperationObject = {
  summary?: string;
  tags?: string[];
  parameters?: ParameterObject[];
  requestBody?: RequestBodyObject;
  responses: Record<string, ResponseObject>;
};

type PathItemObject = {
  get?: OperationObject;
  post?: OperationObject;
  put?: OperationObject;
  patch?: OperationObject;
  delete?: OperationObject;
};

type OpenApiSpec = {
  openapi: "3.0.0" | "3.0.1" | "3.0.2" | "3.0.3" | "3.0.4";
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: { url: string; description?: string }[];
  paths: Record<string, PathItemObject>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
};

const jsonResponse = (schema: SchemaObject, description = "OK"): ResponseObject => ({
  description,
  content: { "application/json": { schema } },
});

const okResponse = (dataSchema: SchemaObject, description = "OK"): ResponseObject =>
  jsonResponse(
    {
      allOf: [
        { $ref: "#/components/schemas/ApiSuccess" },
        {
          type: "object",
          properties: { data: dataSchema },
          required: ["data"],
        },
      ],
    },
    description
  );

const errorResponse = (description = "Error"): ResponseObject =>
  jsonResponse({ $ref: "#/components/schemas/ApiError" }, description);

const providerIdParam: ParameterObject = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Provider or master id",
};

const masterIdParam: ParameterObject = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string" },
  description: "Master provider id",
};

const serviceIdQuery: ParameterObject = {
  name: "serviceId",
  in: "query",
  required: true,
  schema: { type: "string" },
};

const fromQuery: ParameterObject = {
  name: "from",
  in: "query",
  required: true,
  schema: { type: "string", format: "date" },
  description: "Local date key (YYYY-MM-DD) in provider timezone, start inclusive.",
};

const toQuery: ParameterObject = {
  name: "to",
  in: "query",
  required: false,
  schema: { type: "string", format: "date" },
  description: "Local date key (YYYY-MM-DD), end exclusive.",
};

const limitQuery: ParameterObject = {
  name: "limit",
  in: "query",
  required: false,
  schema: { type: "integer", minimum: 1, maximum: 14 },
  description: "Page size (days).",
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "МастерРядом API",
    version: "0.1.0",
    description: "Minimal OpenAPI contract for МастерРядом public API.",
  },
  servers: [{ url: "/" }],
  components: {
    schemas: {
      ApiSuccess: {
        type: "object",
        required: ["ok", "data"],
        properties: {
          ok: { type: "boolean", enum: [true] },
          data: {
            oneOf: [
              { $ref: "#/components/schemas/ProviderListData" },
              { $ref: "#/components/schemas/ProviderProfileData" },
              { $ref: "#/components/schemas/ProviderServicesData" },
              { $ref: "#/components/schemas/ProviderServiceData" },
                { $ref: "#/components/schemas/BookingListData" },
                { $ref: "#/components/schemas/BookingData" },
                { $ref: "#/components/schemas/AvailabilitySlotsData" },
                { $ref: "#/components/schemas/HotSlotRuleData" },
                { $ref: "#/components/schemas/HotSlotsData" },
                { $ref: "#/components/schemas/HotSlotsRunData" },
                { $ref: "#/components/schemas/WeeklyScheduleData" },
              { $ref: "#/components/schemas/CountData" },
              { $ref: "#/components/schemas/DeleteResult" },
              { $ref: "#/components/schemas/TelegramLinkData" },
              { $ref: "#/components/schemas/TelegramStatusData" },
              { $ref: "#/components/schemas/TelegramSettingsData" },
              { $ref: "#/components/schemas/TelegramWebhookData" },
              { $ref: "#/components/schemas/VkStatusData" },
              { $ref: "#/components/schemas/VkDisableData" },
              { $ref: "#/components/schemas/MediaAssetData" },
              { $ref: "#/components/schemas/MediaAssetListData" },
              { $ref: "#/components/schemas/ReviewData" },
              { $ref: "#/components/schemas/ReviewListData" },
              { $ref: "#/components/schemas/CanLeaveReviewData" },
              { $ref: "#/components/schemas/StudioCalendarData" },
              { $ref: "#/components/schemas/TimeBlockData" },
              { $ref: "#/components/schemas/StudioServicesData" },
              { $ref: "#/components/schemas/AssignMasterData" },
              { $ref: "#/components/schemas/StudioMasterData" },
              { $ref: "#/components/schemas/StudioMasterListData" },
              { $ref: "#/components/schemas/BulkUpdatedData" },
              { $ref: "#/components/schemas/StudioCategoryData" },
              { $ref: "#/components/schemas/MasterDayData" },
              { $ref: "#/components/schemas/MasterScheduleData" },
              { $ref: "#/components/schemas/MasterProfileData" },
              { $ref: "#/components/schemas/MasterPortfolioListData" },
              { $ref: "#/components/schemas/PortfolioFeedData" },
              { $ref: "#/components/schemas/PortfolioDetailData" },
              { $ref: "#/components/schemas/CatalogSearchData" },
              { $ref: "#/components/schemas/StudioBookingCreatedData" },
              { $ref: "#/components/schemas/StudioMasterScheduleData" },
              { $ref: "#/components/schemas/MeData" },
            ],
          },
        },
      },
      ApiError: {
        type: "object",
        required: ["ok", "error"],
        properties: {
          ok: { type: "boolean", enum: [false] },
          error: {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string" },
              code: { type: "string" },
              details: {
                type: "object",
                nullable: true,
                additionalProperties: true,
              },
            },
          },
        },
      },
      ProviderType: {
        type: "string",
        enum: ["MASTER", "STUDIO"],
      },
      ProviderService: {
        type: "object",
        required: ["id", "name", "durationMin", "price"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
        },
      },
      ProviderCard: {
        type: "object",
        required: [
          "id",
          "type",
          "name",
          "avatarUrl",
          "tagline",
          "rating",
          "reviews",
          "priceFrom",
          "address",
          "district",
          "categories",
          "availableToday",
        ],
        properties: {
          id: { type: "string" },
          type: { $ref: "#/components/schemas/ProviderType" },
          name: { type: "string" },
          avatarUrl: { type: "string", nullable: true },
          tagline: { type: "string" },
          rating: { type: "number" },
          reviews: { type: "integer" },
          priceFrom: { type: "integer" },
          address: { type: "string" },
          district: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          availableToday: { type: "boolean" },
        },
      },
      ProviderProfile: {
        allOf: [
          { $ref: "#/components/schemas/ProviderCard" },
          {
            type: "object",
            required: ["services", "studioId", "bannerUrl", "description", "geoLat", "geoLng", "timezone"],
            properties: {
              services: {
                type: "array",
                items: { $ref: "#/components/schemas/ProviderService" },
              },
              studioId: { type: "string", nullable: true },
              bannerUrl: { type: "string", nullable: true },
              description: { type: "string", nullable: true },
              timezone: { type: "string" },
              geoLat: { type: "number", nullable: true },
              geoLng: { type: "number", nullable: true },
            },
          },
        ],
      },
      StudioPrivateProfile: {
        type: "object",
        required: [
          "id",
          "name",
          "tagline",
          "address",
          "district",
          "categories",
          "contactName",
          "contactPhone",
          "contactEmail",
          "description",
          "avatarUrl",
          "geoLat",
          "geoLng",
          "isPublished",
          "timezone",
          "bufferBetweenBookingsMin",
          "bannerAssetId",
          "bannerUrl",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          tagline: { type: "string" },
          address: { type: "string" },
          district: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          contactName: { type: "string", nullable: true },
          contactPhone: { type: "string", nullable: true },
          contactEmail: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          isPublished: { type: "boolean" },
          timezone: { type: "string" },
          bufferBetweenBookingsMin: { type: "integer" },
          bannerAssetId: { type: "string", nullable: true },
          bannerUrl: { type: "string", nullable: true },
        },
      },
      StudioPrivateProfileData: {
        type: "object",
        required: ["studio"],
        properties: {
          studio: { $ref: "#/components/schemas/StudioPrivateProfile" },
        },
      },
      StudioPrivateProfileUpdateInput: {
        type: "object",
        properties: {
          name: { type: "string" },
          tagline: { type: "string" },
          address: { type: "string" },
          district: { type: "string" },
          categories: { type: "array", items: { type: "string" } },
          contactName: { type: "string", nullable: true },
          contactPhone: { type: "string", nullable: true },
          contactEmail: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          isPublished: { type: "boolean" },
          timezone: { type: "string" },
          bannerAssetId: { type: "string", nullable: true },
        },
      },
      Service: {
        type: "object",
        required: ["id", "providerId", "name", "durationMin", "price", "isEnabled", "createdAt", "updatedAt"],
        properties: {
          id: { type: "string" },
          providerId: { type: "string" },
          name: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
          isEnabled: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
        BookingStatus: {
          type: "string",
          enum: [
            "PENDING",
            "CONFIRMED",
            "CHANGE_REQUESTED",
            "REJECTED",
            "IN_PROGRESS",
            "FINISHED",
          ],
        },
        DiscountType: {
          type: "string",
          enum: ["PERCENT", "FIXED"],
        },
        DiscountApplyMode: {
          type: "string",
          enum: ["ALL_SERVICES", "PRICE_FROM", "MANUAL"],
        },
        BookingCancelledBy: {
          type: "string",
          enum: ["CLIENT", "PROVIDER", "SYSTEM"],
        },
      BookingStatusUpdate: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string" },
          status: { $ref: "#/components/schemas/BookingStatus" },
        },
      },
      BookingService: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
      },
      BookingDto: {
        type: "object",
        required: [
          "id",
          "slotLabel",
          "status",
          "providerId",
          "service",
          "clientName",
          "clientPhone",
        ],
        properties: {
          id: { type: "string" },
          slotLabel: { type: "string" },
          status: { $ref: "#/components/schemas/BookingStatus" },
          providerId: { type: "string" },
          masterProviderId: { type: "string", nullable: true },
          startAtUtc: { type: "string", format: "date-time", nullable: true },
          endAtUtc: { type: "string", format: "date-time", nullable: true },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          comment: { type: "string", nullable: true },
          service: { $ref: "#/components/schemas/BookingService" },
        },
      },
        AvailabilitySlot: {
          type: "object",
          required: ["startAtUtc", "endAtUtc", "label"],
          properties: {
            startAtUtc: { type: "string", format: "date-time" },
            endAtUtc: { type: "string", format: "date-time" },
            label: { type: "string" },
            isHot: { type: "boolean" },
            discountType: { $ref: "#/components/schemas/DiscountType" },
            discountValue: { type: "integer" },
          },
        },
      AvailabilitySlotsMeta: {
        type: "object",
        required: ["fromDate", "toDateExclusive", "totalDays", "hasMore", "pageSize"],
        properties: {
          fromDate: { type: "string", format: "date" },
          toDateExclusive: { type: "string", format: "date" },
          totalDays: { type: "integer" },
          hasMore: { type: "boolean" },
          pageSize: { type: "integer" },
          stale: { type: "boolean" },
        },
      },
      ScheduleBreak: {
        type: "object",
        required: ["startLocal", "endLocal"],
        properties: {
          startLocal: { type: "string" },
          endLocal: { type: "string" },
        },
      },
      WeeklyScheduleItem: {
        type: "object",
        required: ["dayOfWeek", "startLocal", "endLocal"],
        properties: {
          dayOfWeek: { type: "integer", minimum: 0, maximum: 6 },
          startLocal: { type: "string" },
          endLocal: { type: "string" },
          breaks: { type: "array", items: { $ref: "#/components/schemas/ScheduleBreak" } },
        },
      },
      ProviderListData: {
        type: "object",
        required: ["providers"],
        properties: {
          providers: { type: "array", items: { $ref: "#/components/schemas/ProviderCard" } },
        },
      },
      ProviderProfileData: {
        type: "object",
        required: ["provider"],
        properties: {
          provider: { $ref: "#/components/schemas/ProviderProfile" },
        },
      },
      ProviderServicesData: {
        type: "object",
        required: ["services"],
        properties: {
          services: { type: "array", items: { $ref: "#/components/schemas/ProviderService" } },
        },
      },
      ProviderServiceData: {
        type: "object",
        required: ["service"],
        properties: {
          service: { $ref: "#/components/schemas/ProviderService" },
        },
      },
      ProviderServiceCreateInput: {
        type: "object",
        required: ["name", "durationMin", "price"],
        properties: {
          name: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
        },
      },
      ProviderServiceUpdateInput: {
        type: "object",
        required: ["serviceId"],
        properties: {
          serviceId: { type: "string" },
          name: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
        },
      },
      ProviderServiceDeleteInput: {
        type: "object",
        required: ["serviceId"],
        properties: {
          serviceId: { type: "string" },
        },
      },
      BookingListData: {
        type: "object",
        required: ["bookings"],
        properties: {
          bookings: { type: "array", items: { $ref: "#/components/schemas/BookingDto" } },
        },
      },
      BookingData: {
        type: "object",
        required: ["booking"],
        properties: {
          booking: {
            oneOf: [
              { $ref: "#/components/schemas/BookingStatusUpdate" },
              { $ref: "#/components/schemas/BookingDto" },
            ],
          },
        },
      },
      BookingCreateInput: {
        type: "object",
        required: ["providerId", "serviceId", "slotLabel", "clientName", "clientPhone"],
        properties: {
          providerId: { type: "string" },
          serviceId: { type: "string" },
          masterProviderId: { type: "string" },
          startAtUtc: { type: "string", format: "date-time" },
          endAtUtc: { type: "string", format: "date-time" },
          slotLabel: { type: "string" },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          comment: { type: "string", nullable: true },
        },
      },
      BookingCancelInput: {
        type: "object",
        properties: {
          reason: { type: "string" },
        },
      },
      BookingRescheduleInput: {
        type: "object",
        required: ["startAtUtc", "endAtUtc", "slotLabel"],
        properties: {
          startAtUtc: { type: "string", format: "date-time" },
          endAtUtc: { type: "string", format: "date-time" },
          slotLabel: { type: "string" },
        },
      },
        AvailabilitySlotsData: {
          type: "object",
          required: ["slots", "meta"],
          properties: {
            slots: { type: "array", items: { $ref: "#/components/schemas/AvailabilitySlot" } },
            meta: { $ref: "#/components/schemas/AvailabilitySlotsMeta" },
          },
        },
        HotSlotRule: {
          type: "object",
          required: [
            "isEnabled",
            "triggerHours",
            "discountType",
            "discountValue",
            "applyMode",
            "serviceIds",
          ],
          properties: {
            isEnabled: { type: "boolean" },
            triggerHours: { type: "integer" },
            discountType: { $ref: "#/components/schemas/DiscountType" },
            discountValue: { type: "integer" },
            applyMode: { $ref: "#/components/schemas/DiscountApplyMode" },
            minPriceFrom: { type: "integer", nullable: true },
            serviceIds: { type: "array", items: { type: "string" } },
          },
        },
        HotSlotRuleData: {
          type: "object",
          required: ["rule"],
          properties: {
            rule: { $ref: "#/components/schemas/HotSlotRule" },
          },
        },
        HotSlotRuleInput: {
          type: "object",
          required: [
            "isEnabled",
            "triggerHours",
            "discountType",
            "discountValue",
            "applyMode",
            "serviceIds",
          ],
          properties: {
            isEnabled: { type: "boolean" },
            triggerHours: { type: "integer" },
            discountType: { $ref: "#/components/schemas/DiscountType" },
            discountValue: { type: "integer" },
            applyMode: { $ref: "#/components/schemas/DiscountApplyMode" },
            minPriceFrom: { type: "integer", nullable: true },
            serviceIds: { type: "array", items: { type: "string" } },
          },
        },
        HotSlotProvider: {
          type: "object",
          required: [
            "id",
            "publicUsername",
            "name",
            "avatarUrl",
            "address",
            "district",
            "ratingAvg",
            "ratingCount",
            "timezone",
          ],
          properties: {
            id: { type: "string" },
            publicUsername: { type: "string" },
            name: { type: "string" },
            avatarUrl: { type: "string", nullable: true },
            address: { type: "string" },
            district: { type: "string" },
            ratingAvg: { type: "number" },
            ratingCount: { type: "integer" },
            timezone: { type: "string" },
          },
        },
        HotSlotSlot: {
          type: "object",
          required: ["startAtUtc", "endAtUtc", "discountType", "discountValue", "isActive"],
          properties: {
            startAtUtc: { type: "string", format: "date-time" },
            endAtUtc: { type: "string", format: "date-time" },
            discountType: { $ref: "#/components/schemas/DiscountType" },
            discountValue: { type: "integer" },
            isActive: { type: "boolean" },
          },
        },
        HotSlotService: {
          type: "object",
          required: ["id", "title", "price", "durationMin"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            price: { type: "integer" },
            durationMin: { type: "integer" },
          },
        },
        HotSlotItem: {
          type: "object",
          required: ["id", "provider", "slot"],
          properties: {
            id: { type: "string" },
            provider: { $ref: "#/components/schemas/HotSlotProvider" },
            slot: { $ref: "#/components/schemas/HotSlotSlot" },
            service: { allOf: [{ $ref: "#/components/schemas/HotSlotService" }], nullable: true },
          },
        },
        HotSlotsData: {
          type: "object",
          required: ["items"],
          properties: {
            items: { type: "array", items: { $ref: "#/components/schemas/HotSlotItem" } },
          },
        },
        HotSlotsJobStats: {
          type: "object",
          required: ["processed", "skipped", "activated"],
          properties: {
            processed: { type: "integer" },
            skipped: { type: "integer" },
            activated: { type: "integer" },
          },
        },
        HotSlotsRunData: {
          type: "object",
          required: ["stats"],
          properties: {
            stats: { $ref: "#/components/schemas/HotSlotsJobStats" },
          },
        },
        WeeklyScheduleData: {
          type: "object",
          required: ["items"],
          properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/WeeklyScheduleItem" } },
        },
      },
      WeeklyScheduleInput: {
        type: "array",
        items: { $ref: "#/components/schemas/WeeklyScheduleItem" },
      },
      CountData: {
        type: "object",
        required: ["count"],
        properties: {
          count: { type: "integer" },
        },
      },
      DeleteResult: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      TelegramLinkData: {
        type: "object",
        required: ["url", "expiresAt"],
        properties: {
          url: { type: "string" },
          expiresAt: { type: "string", format: "date-time" },
          alreadyLinked: { type: "boolean" },
        },
      },
      TelegramStatusData: {
        type: "object",
        required: ["linked", "enabled", "botUsername"],
        properties: {
          linked: { type: "boolean" },
          enabled: { type: "boolean" },
          botUsername: { type: "string" },
        },
      },
      TelegramSettingsInput: {
        type: "object",
        required: ["enabled"],
        properties: {
          enabled: { type: "boolean" },
        },
      },
      TelegramSettingsData: {
        type: "object",
        required: ["enabled"],
        properties: {
          enabled: { type: "boolean" },
        },
      },
      TelegramWebhookData: {
        type: "object",
        nullable: true,
        description: "Empty webhook response",
      },
      VkStatusData: {
        type: "object",
        required: ["linked", "enabled"],
        properties: {
          linked: { type: "boolean" },
          enabled: { type: "boolean" },
        },
      },
      VkDisableData: {
        type: "object",
        required: ["enabled"],
        properties: {
          enabled: { type: "boolean" },
        },
      },
      MediaEntityType: {
        type: "string",
        enum: ["USER", "MASTER", "STUDIO", "SITE"],
      },
      MediaKind: {
        type: "string",
        enum: ["AVATAR", "PORTFOLIO"],
      },
      MediaAsset: {
        type: "object",
        required: [
          "id",
          "entityType",
          "entityId",
          "kind",
          "mimeType",
          "sizeBytes",
          "originalFilename",
          "url",
          "createdAt",
        ],
        properties: {
          id: { type: "string" },
          entityType: { $ref: "#/components/schemas/MediaEntityType" },
          entityId: { type: "string" },
          kind: { $ref: "#/components/schemas/MediaKind" },
          mimeType: { type: "string" },
          sizeBytes: { type: "integer" },
          originalFilename: { type: "string" },
          url: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MediaAssetData: {
        type: "object",
        required: ["asset"],
        properties: {
          asset: { $ref: "#/components/schemas/MediaAsset" },
        },
      },
      MediaAssetListData: {
        type: "object",
        required: ["assets"],
        properties: {
          assets: { type: "array", items: { $ref: "#/components/schemas/MediaAsset" } },
        },
      },
      ReviewTargetType: {
        type: "string",
        enum: ["provider", "studio"],
      },
      Review: {
        type: "object",
        required: [
          "id",
          "bookingId",
          "authorId",
          "authorName",
          "targetType",
          "targetId",
          "rating",
          "text",
          "replyText",
          "repliedAt",
          "reportedAt",
          "createdAt",
        ],
        properties: {
          id: { type: "string" },
          bookingId: { type: "string", nullable: true },
          authorId: { type: "string" },
          authorName: { type: "string" },
          targetType: { $ref: "#/components/schemas/ReviewTargetType" },
          targetId: { type: "string" },
          rating: { type: "integer", minimum: 1, maximum: 5 },
          text: { type: "string", nullable: true },
          replyText: { type: "string", nullable: true },
          repliedAt: { type: "string", format: "date-time", nullable: true },
          reportedAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ReviewCreateInput: {
        type: "object",
        required: ["bookingId", "rating"],
        properties: {
          bookingId: { type: "string" },
          rating: { type: "integer", minimum: 1, maximum: 5 },
          text: { type: "string", maxLength: 1000 },
        },
      },
      ReviewReplyInput: {
        type: "object",
        required: ["text"],
        properties: {
          text: { type: "string", maxLength: 1500 },
        },
      },
      ReviewReportInput: {
        type: "object",
        required: ["comment"],
        properties: {
          comment: { type: "string", maxLength: 1500 },
        },
      },
      ReviewData: {
        type: "object",
        required: ["review"],
        properties: {
          review: { $ref: "#/components/schemas/Review" },
        },
      },
      ReviewListData: {
        type: "object",
        required: ["reviews"],
        properties: {
          reviews: { type: "array", items: { $ref: "#/components/schemas/Review" } },
        },
      },
      CanLeaveReviewData: {
        type: "object",
        required: ["canLeave", "reviewId", "canDelete"],
        properties: {
          canLeave: { type: "boolean" },
          reviewId: { type: "string", nullable: true },
          canDelete: { type: "boolean" },
        },
      },
      CalendarMaster: {
        type: "object",
        required: ["id", "name", "isActive"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isActive: { type: "boolean" },
        },
      },
      CalendarBooking: {
        type: "object",
        required: ["id", "masterId", "serviceId", "serviceTitle", "startAt", "endAt", "status", "clientName", "clientPhone"],
        properties: {
          id: { type: "string" },
          masterId: { type: "string", nullable: true },
          serviceId: { type: "string" },
          serviceTitle: { type: "string" },
          startAt: { type: "string", format: "date-time", nullable: true },
          endAt: { type: "string", format: "date-time", nullable: true },
          status: { type: "string" },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
        },
      },
      TimeBlock: {
        type: "object",
        required: ["id", "masterId", "startAt", "endAt", "type", "note"],
        properties: {
          id: { type: "string" },
          masterId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["BREAK", "BLOCK"] },
          note: { type: "string", nullable: true },
        },
      },
      StudioCalendarData: {
        type: "object",
        required: ["masters", "bookings", "blocks"],
        properties: {
          masters: { type: "array", items: { $ref: "#/components/schemas/CalendarMaster" } },
          bookings: { type: "array", items: { $ref: "#/components/schemas/CalendarBooking" } },
          blocks: { type: "array", items: { $ref: "#/components/schemas/TimeBlock" } },
        },
      },
      StudioClientListItem: {
        type: "object",
        required: ["key", "displayName", "phone", "lastBookingAt", "lastServiceName", "visitsCount"],
        properties: {
          key: { type: "string" },
          displayName: { type: "string" },
          phone: { type: "string" },
          lastBookingAt: { type: "string", format: "date-time" },
          lastServiceName: { type: "string" },
          visitsCount: { type: "integer" },
        },
      },
      StudioClientsData: {
        type: "object",
        required: ["clients"],
        properties: {
          clients: { type: "array", items: { $ref: "#/components/schemas/StudioClientListItem" } },
        },
      },
      StudioFinanceRow: {
        type: "object",
        required: ["key", "label", "visitsCount", "sumAmount"],
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          visitsCount: { type: "integer" },
          sumAmount: { type: "integer" },
        },
      },
      StudioFinanceData: {
        type: "object",
        required: ["groupBy", "rows", "totalVisits", "totalAmount", "hasCategories"],
        properties: {
          groupBy: { type: "string", enum: ["masters", "categories", "services"] },
          rows: { type: "array", items: { $ref: "#/components/schemas/StudioFinanceRow" } },
          totalVisits: { type: "integer" },
          totalAmount: { type: "integer" },
          hasCategories: { type: "boolean" },
        },
      },
      CreateTimeBlockInput: {
        type: "object",
        required: ["studioId", "masterId", "startAt", "endAt", "type"],
        properties: {
          studioId: { type: "string" },
          masterId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["BREAK", "BLOCK"] },
          note: { type: "string" },
        },
      },
      TimeBlockData: {
        type: "object",
        required: ["block"],
        properties: {
          block: { $ref: "#/components/schemas/TimeBlock" },
        },
      },
      StudioServiceAssignedMaster: {
        type: "object",
        required: ["masterId", "masterName"],
        properties: {
          masterId: { type: "string" },
          masterName: { type: "string" },
        },
      },
      StudioService: {
        type: "object",
        required: ["id", "categoryId", "title", "basePrice", "baseDurationMin", "sortOrder", "isActive", "masters"],
        properties: {
          id: { type: "string" },
          categoryId: { type: "string", nullable: true },
          title: { type: "string" },
          basePrice: { type: "integer" },
          baseDurationMin: { type: "integer" },
          sortOrder: { type: "integer" },
          isActive: { type: "boolean" },
          masters: { type: "array", items: { $ref: "#/components/schemas/StudioServiceAssignedMaster" } },
        },
      },
      StudioServiceCategory: {
        type: "object",
        required: ["id", "title", "sortOrder", "services"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          sortOrder: { type: "integer" },
          services: { type: "array", items: { $ref: "#/components/schemas/StudioService" } },
        },
      },
      StudioServicesData: {
        type: "object",
        required: ["categories"],
        properties: {
          categories: { type: "array", items: { $ref: "#/components/schemas/StudioServiceCategory" } },
        },
      },
      CreateStudioCategoryInput: {
        type: "object",
        required: ["studioId", "title"],
        properties: {
          studioId: { type: "string" },
          title: { type: "string" },
        },
      },
      StudioCategoryData: {
        type: "object",
        required: ["id", "title", "sortOrder"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          sortOrder: { type: "integer" },
        },
      },
      ReorderIdsInput: {
        type: "object",
        required: ["studioId", "orderedIds"],
        properties: {
          studioId: { type: "string" },
          orderedIds: { type: "array", items: { type: "string" } },
        },
      },
      CreateStudioServiceInput: {
        type: "object",
        required: ["studioId", "categoryId", "title", "basePrice", "baseDurationMin"],
        properties: {
          studioId: { type: "string" },
          categoryId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          basePrice: { type: "integer" },
          baseDurationMin: { type: "integer" },
        },
      },
      UpdateStudioServiceInput: {
        type: "object",
        required: ["studioId"],
        properties: {
          studioId: { type: "string" },
          categoryId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          basePrice: { type: "integer" },
          baseDurationMin: { type: "integer" },
          isActive: { type: "boolean" },
        },
      },
      AssignMasterInput: {
        type: "object",
        required: ["studioId", "masterId"],
        properties: {
          studioId: { type: "string" },
          masterId: { type: "string" },
        },
      },
      AssignMasterData: {
        type: "object",
        required: ["serviceId", "masterId"],
        properties: {
          serviceId: { type: "string" },
          masterId: { type: "string" },
        },
      },
      StudioMasterService: {
        type: "object",
        required: [
          "serviceId",
          "serviceTitle",
          "isEnabled",
          "priceOverride",
          "durationOverrideMin",
          "commissionPct",
        ],
        properties: {
          serviceId: { type: "string" },
          serviceTitle: { type: "string" },
          isEnabled: { type: "boolean" },
          priceOverride: { type: "integer", nullable: true },
          durationOverrideMin: { type: "integer", nullable: true },
          commissionPct: { type: "number", nullable: true },
        },
      },
      StudioMaster: {
        type: "object",
        required: ["id", "name", "isActive", "tagline", "services"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          tagline: { type: "string" },
          services: { type: "array", items: { $ref: "#/components/schemas/StudioMasterService" } },
        },
      },
      StudioMasterData: {
        type: "object",
        required: ["id", "name", "isActive", "tagline", "services"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          tagline: { type: "string" },
          services: { type: "array", items: { $ref: "#/components/schemas/StudioMasterService" } },
        },
      },
      StudioMasterListItem: {
        type: "object",
        required: ["id", "name", "isActive", "title", "status", "phone"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          isActive: { type: "boolean" },
          title: { type: "string" },
          status: { type: "string", enum: ["PENDING", "ACTIVE"] },
          phone: { type: "string", nullable: true },
        },
      },
      StudioMasterListData: {
        type: "object",
        required: ["masters"],
        properties: {
          masters: { type: "array", items: { $ref: "#/components/schemas/StudioMasterListItem" } },
        },
      },
      CreateStudioMasterInput: {
        type: "object",
        required: ["studioId", "displayName", "phone", "title"],
        properties: {
          studioId: { type: "string" },
          displayName: { type: "string" },
          phone: { type: "string" },
          title: { type: "string" },
        },
      },
      UpdateStudioMasterInput: {
        type: "object",
        required: ["studioId"],
        properties: {
          studioId: { type: "string" },
          displayName: { type: "string" },
          tagline: { type: "string" },
          isActive: { type: "boolean" },
        },
      },
      BulkMasterServicesInput: {
        type: "object",
        required: ["studioId", "items"],
        properties: {
          studioId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["serviceId", "isEnabled"],
              properties: {
                serviceId: { type: "string" },
                isEnabled: { type: "boolean" },
                priceOverride: { type: "integer", nullable: true },
                durationOverrideMin: { type: "integer", nullable: true },
                commissionPct: { type: "number", nullable: true },
              },
            },
          },
        },
      },
      BulkUpdatedData: {
        type: "object",
        required: ["updated"],
        properties: {
          updated: { type: "integer" },
        },
      },
      MasterDayBooking: {
        type: "object",
        required: [
          "id",
          "startAt",
          "endAt",
          "rawStatus",
          "status",
          "canNoShow",
          "clientName",
          "clientPhone",
          "notes",
          "serviceTitle",
        ],
        properties: {
          id: { type: "string" },
          startAt: { type: "string", format: "date-time", nullable: true },
          endAt: { type: "string", format: "date-time", nullable: true },
          rawStatus: { type: "string" },
          status: { type: "string" },
          canNoShow: { type: "boolean" },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          notes: { type: "string", nullable: true },
          serviceTitle: { type: "string" },
        },
      },
      MasterDayWorkingHours: {
        type: "object",
        required: ["isDayOff", "startLocal", "endLocal", "bufferBetweenBookingsMin"],
        properties: {
          isDayOff: { type: "boolean" },
          startLocal: { type: "string", nullable: true },
          endLocal: { type: "string", nullable: true },
          bufferBetweenBookingsMin: { type: "integer" },
        },
      },
      MasterDayGap: {
        type: "object",
        required: ["startAt", "endAt", "minutes"],
        properties: {
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          minutes: { type: "integer" },
        },
      },
      MasterDayReview: {
        type: "object",
        required: ["id", "rating", "text", "authorName", "createdAt"],
        properties: {
          id: { type: "string" },
          rating: { type: "integer", minimum: 1, maximum: 5 },
          text: { type: "string", nullable: true },
          authorName: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MasterDayServiceOption: {
        type: "object",
        required: ["id", "title", "price", "durationMin"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          price: { type: "integer" },
          durationMin: { type: "integer" },
        },
      },
      MasterDayData: {
        type: "object",
        required: [
          "date",
          "isSolo",
          "workingHours",
          "bookings",
          "currentBookingId",
          "nextBookingId",
          "monthEarnings",
          "upcomingGaps",
          "latestReviews",
          "services",
        ],
        properties: {
          date: { type: "string" },
          isSolo: { type: "boolean" },
          workingHours: { $ref: "#/components/schemas/MasterDayWorkingHours" },
          bookings: { type: "array", items: { $ref: "#/components/schemas/MasterDayBooking" } },
          currentBookingId: { type: "string", nullable: true },
          nextBookingId: { type: "string", nullable: true },
          monthEarnings: { type: "integer" },
          upcomingGaps: { type: "array", items: { $ref: "#/components/schemas/MasterDayGap" } },
          latestReviews: { type: "array", items: { $ref: "#/components/schemas/MasterDayReview" } },
          services: { type: "array", items: { $ref: "#/components/schemas/MasterDayServiceOption" } },
        },
      },
      CreateMasterBookingInput: {
        type: "object",
        required: ["startAt", "serviceId", "clientName"],
        properties: {
          startAt: { type: "string", format: "date-time" },
          serviceId: { type: "string" },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          notes: { type: "string" },
        },
      },
      UpdateMasterBookingStatusInput: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["CONFIRMED", "REJECTED", "CANCELLED", "NO_SHOW"],
          },
          comment: { type: "string", maxLength: 500 },
        },
      },
      MasterScheduleDayLoad: {
        type: "object",
        required: ["date", "count"],
        properties: {
          date: { type: "string" },
          count: { type: "integer" },
        },
      },
      MasterScheduleRequest: {
        type: "object",
        required: ["id", "type", "status", "createdAt"],
        properties: {
          id: { type: "string" },
          type: { type: "string", enum: ["OFF", "SHIFT", "BLOCK"] },
          status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MasterScheduleData: {
        type: "object",
        required: ["month", "isSolo", "dayLoads", "exceptions", "blocks", "requests", "publishedUntilLocal"],
        properties: {
          month: { type: "string" },
          isSolo: { type: "boolean" },
          dayLoads: { type: "array", items: { $ref: "#/components/schemas/MasterScheduleDayLoad" } },
          exceptions: { type: "array", items: { $ref: "#/components/schemas/WorkException" } },
          blocks: { type: "array", items: { $ref: "#/components/schemas/TimeBlock" } },
          requests: { type: "array", items: { $ref: "#/components/schemas/MasterScheduleRequest" } },
          publishedUntilLocal: { type: "string" },
        },
      },
      CreateMasterScheduleExceptionInput: {
        type: "object",
        required: ["date", "type"],
        properties: {
          date: { type: "string" },
          type: { type: "string", enum: ["OFF", "SHIFT"] },
          startTime: { type: "string" },
          endTime: { type: "string" },
        },
      },
      CreateMasterBlockInput: {
        type: "object",
        required: ["startAt", "endAt", "type"],
        properties: {
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["BREAK", "BLOCK"] },
          note: { type: "string" },
        },
      },
      MasterApplyOrRequestData: {
        type: "object",
        required: ["applied"],
        properties: {
          applied: { type: "boolean" },
          requestId: { type: "string" },
          exceptionId: { type: "string" },
          blockId: { type: "string" },
        },
      },
      MasterProfile: {
        type: "object",
        required: [
          "id",
          "displayName",
          "tagline",
          "address",
          "geoLat",
          "geoLng",
          "bio",
          "avatarUrl",
          "isPublished",
          "isSolo",
          "ratingAvg",
          "ratingCount",
        ],
        properties: {
          id: { type: "string" },
          displayName: { type: "string" },
          tagline: { type: "string" },
          address: { type: "string" },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          bio: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          isPublished: { type: "boolean" },
          isSolo: { type: "boolean" },
          ratingAvg: { type: "number" },
          ratingCount: { type: "integer" },
        },
      },
      MasterProfileService: {
        type: "object",
        required: [
          "serviceId",
          "title",
          "isEnabled",
          "basePrice",
          "baseDurationMin",
          "priceOverride",
          "durationOverrideMin",
          "effectivePrice",
          "effectiveDurationMin",
          "canEditPrice",
        ],
        properties: {
          serviceId: { type: "string" },
          title: { type: "string" },
          isEnabled: { type: "boolean" },
          basePrice: { type: "integer" },
          baseDurationMin: { type: "integer" },
          priceOverride: { type: "integer", nullable: true },
          durationOverrideMin: { type: "integer", nullable: true },
          effectivePrice: { type: "integer" },
          effectiveDurationMin: { type: "integer" },
          canEditPrice: { type: "boolean" },
        },
      },
      MasterPortfolioItem: {
        type: "object",
        required: ["id", "mediaUrl", "caption", "serviceIds", "createdAt"],
        properties: {
          id: { type: "string" },
          mediaUrl: { type: "string" },
          caption: { type: "string", nullable: true },
          serviceIds: { type: "array", items: { type: "string" } },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MasterProfileData: {
        type: "object",
        required: ["master", "services", "portfolio"],
        properties: {
          master: { $ref: "#/components/schemas/MasterProfile" },
          services: { type: "array", items: { $ref: "#/components/schemas/MasterProfileService" } },
          portfolio: { type: "array", items: { $ref: "#/components/schemas/MasterPortfolioItem" } },
        },
      },
      UpdateMasterProfileInput: {
        type: "object",
        properties: {
          displayName: { type: "string" },
          tagline: { type: "string" },
          address: { type: "string" },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          bio: { type: "string", nullable: true },
          avatarUrl: { type: "string", nullable: true },
          isPublished: { type: "boolean" },
        },
      },
      UpsertMasterServicesInput: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["serviceId", "isEnabled"],
              properties: {
                serviceId: { type: "string" },
                isEnabled: { type: "boolean" },
                durationOverrideMin: { type: "integer", nullable: true },
                priceOverride: { type: "integer", nullable: true },
              },
            },
          },
        },
      },
      CreateMasterPortfolioInput: {
        type: "object",
        required: ["mediaUrl", "serviceIds"],
        properties: {
          mediaUrl: { type: "string" },
          caption: { type: "string" },
          serviceIds: { type: "array", items: { type: "string" } },
        },
      },
      MasterPortfolioListData: {
        type: "object",
        required: ["items"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/MasterPortfolioItem" } },
        },
      },
      MeUser: {
        type: "object",
        required: ["id", "roles"],
        properties: {
          id: { type: "string" },
          roles: { type: "array", items: { type: "string" } },
          displayName: { type: "string", nullable: true },
          phone: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          externalPhotoUrl: { type: "string", nullable: true },
          firstName: { type: "string", nullable: true },
          lastName: { type: "string", nullable: true },
          middleName: { type: "string", nullable: true },
          birthDate: { type: "string", nullable: true },
          address: { type: "string", nullable: true },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          hasMasterProfile: { type: "boolean" },
          hasStudioProfile: { type: "boolean" },
        },
      },
      MeData: {
        type: "object",
        required: ["user"],
        properties: {
          user: { $ref: "#/components/schemas/MeUser" },
        },
      },
      MeUpdateInput: {
        type: "object",
        properties: {
          displayName: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          middleName: { type: "string" },
          birthDate: { type: "string" },
          address: { type: "string" },
        },
      },
      MoveStudioBookingInput: {
        type: "object",
        required: ["studioId", "targetMasterId", "targetStartAt", "strategy", "pricing"],
        properties: {
          studioId: { type: "string" },
          targetMasterId: { type: "string" },
          targetStartAt: { type: "string", format: "date-time" },
          strategy: { type: "string", enum: ["KEEP_SERVICE", "CHANGE_SERVICE"] },
          pricing: { type: "string", enum: ["KEEP_PRICE", "APPLY_TARGET"] },
        },
      },
      CreateStudioBookingInput: {
        type: "object",
        required: ["studioId", "masterId", "startAt", "serviceId", "clientName"],
        properties: {
          studioId: { type: "string" },
          masterId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          serviceId: { type: "string" },
          clientName: { type: "string" },
          clientPhone: { type: "string" },
          notes: { type: "string" },
        },
      },
      StudioBookingCreatedData: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
        },
      },
      UpdateTimeBlockInput: {
        type: "object",
        required: ["studioId"],
        properties: {
          studioId: { type: "string" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          type: { type: "string", enum: ["BREAK", "BLOCK"] },
          note: { type: "string", nullable: true },
        },
      },
      WorkTemplateBreak: {
        type: "object",
        required: ["startTime", "endTime"],
        properties: {
          startTime: { type: "string" },
          endTime: { type: "string" },
        },
      },
      WorkTemplate: {
        type: "object",
        required: ["id", "title", "startTime", "endTime", "breaks"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          breaks: { type: "array", items: { $ref: "#/components/schemas/WorkTemplateBreak" } },
        },
      },
      WorkDayRule: {
        type: "object",
        required: ["id", "weekday", "templateId", "isWorking"],
        properties: {
          id: { type: "string" },
          weekday: { type: "integer" },
          templateId: { type: "string" },
          isWorking: { type: "boolean" },
        },
      },
      WorkException: {
        type: "object",
        required: ["id", "date", "type", "startTime", "endTime"],
        properties: {
          id: { type: "string" },
          date: { type: "string" },
          type: { type: "string", enum: ["OFF", "SHIFT"] },
          startTime: { type: "string", nullable: true },
          endTime: { type: "string", nullable: true },
        },
      },
      StudioMasterScheduleData: {
        type: "object",
        required: ["templates", "dayRules", "exceptions", "blocks"],
        properties: {
          templates: { type: "array", items: { $ref: "#/components/schemas/WorkTemplate" } },
          dayRules: { type: "array", items: { $ref: "#/components/schemas/WorkDayRule" } },
          exceptions: { type: "array", items: { $ref: "#/components/schemas/WorkException" } },
          blocks: { type: "array", items: { $ref: "#/components/schemas/TimeBlock" } },
        },
      },
      CreateWorkTemplateInput: {
        type: "object",
        required: ["studioId", "title", "startTime", "endTime", "breaks"],
        properties: {
          studioId: { type: "string" },
          title: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          breaks: { type: "array", items: { $ref: "#/components/schemas/WorkTemplateBreak" } },
        },
      },
      UpsertDayRulesInput: {
        type: "object",
        required: ["studioId", "items"],
        properties: {
          studioId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["weekday", "templateId", "isWorking"],
              properties: {
                weekday: { type: "integer", minimum: 0, maximum: 6 },
                templateId: { type: "string" },
                isWorking: { type: "boolean" },
              },
            },
          },
        },
      },
      CreateWorkExceptionInput: {
        type: "object",
        required: ["studioId", "date", "type"],
        properties: {
          studioId: { type: "string" },
          date: { type: "string" },
          type: { type: "string", enum: ["OFF", "SHIFT"] },
          startTime: { type: "string" },
          endTime: { type: "string" },
        },
      },
      MasterBookingStatusData: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string" },
          status: { type: "string" },
        },
      },
      PortfolioFeedItem: {
        type: "object",
        required: [
          "id",
          "mediaUrl",
          "caption",
          "width",
          "height",
          "masterId",
          "masterName",
          "masterAvatarUrl",
          "studioName",
          "serviceIds",
          "primaryServiceTitle",
          "totalDurationMin",
          "totalPrice",
          "favoritesCount",
          "isFavorited",
        ],
        properties: {
          id: { type: "string" },
          mediaUrl: { type: "string" },
          caption: { type: "string", nullable: true },
          width: { type: "integer", nullable: true },
          height: { type: "integer", nullable: true },
          masterId: { type: "string" },
          masterName: { type: "string" },
          masterAvatarUrl: { type: "string", nullable: true },
          studioName: { type: "string", nullable: true },
          serviceIds: { type: "array", items: { type: "string" } },
          primaryServiceTitle: { type: "string", nullable: true },
          totalDurationMin: { type: "integer" },
          totalPrice: { type: "integer" },
          favoritesCount: { type: "integer" },
          isFavorited: { type: "boolean" },
        },
      },
      NearestSlot: {
        type: "object",
        required: ["startAt"],
        properties: {
          startAt: { type: "string", format: "date-time" },
        },
      },
      SimilarPortfolioItem: {
        type: "object",
        required: ["id", "mediaUrl", "masterName", "totalPrice"],
        properties: {
          id: { type: "string" },
          mediaUrl: { type: "string" },
          masterName: { type: "string" },
          totalPrice: { type: "integer" },
        },
      },
      PortfolioServiceOption: {
        type: "object",
        required: ["serviceId", "title", "durationMin", "price"],
        properties: {
          serviceId: { type: "string" },
          title: { type: "string" },
          durationMin: { type: "integer" },
          price: { type: "integer" },
        },
      },
      PortfolioDetail: {
        allOf: [
          { $ref: "#/components/schemas/PortfolioFeedItem" },
          {
            type: "object",
            required: ["serviceOptions", "nearestSlots", "similarItems"],
            properties: {
              serviceOptions: {
                type: "array",
                items: { $ref: "#/components/schemas/PortfolioServiceOption" },
              },
              nearestSlots: {
                type: "array",
                items: { $ref: "#/components/schemas/NearestSlot" },
              },
              similarItems: {
                type: "array",
                items: { $ref: "#/components/schemas/SimilarPortfolioItem" },
              },
            },
          },
        ],
      },
      ToggleFavoriteData: {
        type: "object",
        required: ["isFavorited", "favoritesCount"],
        properties: {
          isFavorited: { type: "boolean" },
          favoritesCount: { type: "integer" },
        },
      },
      PortfolioFeedData: {
        type: "object",
        required: ["items", "nextCursor"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/PortfolioFeedItem" } },
          nextCursor: { type: "string", nullable: true },
        },
      },
      PortfolioDetailData: {
        type: "object",
        required: ["item"],
        properties: {
          item: { $ref: "#/components/schemas/PortfolioDetail" },
        },
      },
      CatalogEntityType: {
        type: "string",
        enum: ["master", "studio"],
      },
      CatalogPrimaryService: {
        type: "object",
        required: ["title", "price", "durationMin"],
        properties: {
          title: { type: "string" },
          price: { type: "integer" },
          durationMin: { type: "integer" },
        },
      },
      CatalogNextSlot: {
        type: "object",
        required: ["startAt"],
        properties: {
          startAt: { type: "string", format: "date-time" },
        },
      },
      CatalogSearchItem: {
        type: "object",
        required: [
          "type",
          "id",
          "publicUsername",
          "title",
          "avatarUrl",
          "ratingAvg",
          "reviewsCount",
          "distanceMeters",
          "photos",
          "geoLat",
          "geoLng",
          "primaryService",
          "minPrice",
          "nextSlot",
        ],
        properties: {
          type: { $ref: "#/components/schemas/CatalogEntityType" },
          id: { type: "string" },
          publicUsername: { type: "string", nullable: true },
          title: { type: "string" },
          avatarUrl: { type: "string", nullable: true },
          ratingAvg: { type: "number" },
          reviewsCount: { type: "integer" },
          distanceMeters: { type: "integer", nullable: true },
          photos: { type: "array", items: { type: "string" } },
          geoLat: { type: "number", nullable: true },
          geoLng: { type: "number", nullable: true },
          primaryService: { allOf: [{ $ref: "#/components/schemas/CatalogPrimaryService" }], nullable: true },
          minPrice: { type: "integer", nullable: true },
          nextSlot: { allOf: [{ $ref: "#/components/schemas/CatalogNextSlot" }], nullable: true },
          todaySlotsCount: { type: "integer" },
        },
      },
      CatalogSearchData: {
        type: "object",
        required: ["items", "nextCursor"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/CatalogSearchItem" } },
          nextCursor: { type: "integer", nullable: true },
        },
      },
      NotificationCenterInviteItem: {
        type: "object",
        required: ["id", "studioId", "studioName", "studioTagline", "studioAvatarUrl", "createdAt"],
        properties: {
          id: { type: "string" },
          studioId: { type: "string" },
          studioName: { type: "string" },
          studioTagline: { type: "string", nullable: true },
          studioAvatarUrl: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      NotificationCenterNotificationItem: {
        type: "object",
        required: ["id", "title", "body", "type", "channel", "readAt", "createdAt"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          body: { type: "string", nullable: true },
          type: { type: "string", enum: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED", "SCHEDULE_REQUEST"] },
          channel: { type: "string", enum: ["MASTER", "STUDIO", "SYSTEM"] },
          readAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          openHref: { type: "string", nullable: true },
        },
      },
      NotificationCenterData: {
        type: "object",
        required: ["invites", "notifications", "unreadCount", "hasPhone"],
        properties: {
          invites: { type: "array", items: { $ref: "#/components/schemas/NotificationCenterInviteItem" } },
          notifications: { type: "array", items: { $ref: "#/components/schemas/NotificationCenterNotificationItem" } },
          unreadCount: { type: "integer" },
          hasPhone: { type: "boolean" },
        },
      },
    },
  },
  paths: {
    "/api/catalog/search": {
      get: {
        summary: "Search catalog for masters/studios",
        tags: ["catalog"],
        parameters: [
          { name: "serviceQuery", in: "query", required: false, schema: { type: "string" } },
          { name: "district", in: "query", required: false, schema: { type: "string" } },
          { name: "date", in: "query", required: false, schema: { type: "string", format: "date" } },
            { name: "priceMin", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
            { name: "priceMax", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
            { name: "availableToday", in: "query", required: false, schema: { type: "boolean" } },
            { name: "hot", in: "query", required: false, schema: { type: "boolean" } },
          { name: "ratingMin", in: "query", required: false, schema: { type: "number", minimum: 0, maximum: 5 } },
          { name: "entityType", in: "query", required: false, schema: { type: "string", enum: ["all", "master", "studio"] } },
          { name: "view", in: "query", required: false, schema: { type: "string", enum: ["list", "map"] } },
          { name: "lat", in: "query", required: false, schema: { type: "number" } },
          { name: "lng", in: "query", required: false, schema: { type: "number" } },
          { name: "bbox", in: "query", required: false, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 40 } },
          { name: "cursor", in: "query", required: false, schema: { type: "integer", minimum: 0 } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/CatalogSearchData" }),
          "400": errorResponse("Validation error"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/providers": {
      get: {
        summary: "List providers",
        tags: ["providers"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderListData" }),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/providers/{id}": {
      get: {
        summary: "Get provider profile",
        tags: ["providers"],
        parameters: [providerIdParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderProfileData" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Provider not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studios/{id}": {
      get: {
        summary: "Get studio private profile",
        tags: ["studio"],
        parameters: [providerIdParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioPrivateProfileData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Update studio private profile",
        tags: ["studio"],
        parameters: [providerIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/StudioPrivateProfileUpdateInput" },
            },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioPrivateProfileData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/notifications/center": {
      get: {
        summary: "Get unified notifications center payload",
        tags: ["notifications"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/NotificationCenterData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/masters/{id}/services": {
      get: {
        summary: "List master services",
        tags: ["services", "masters"],
        parameters: [masterIdParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderServicesData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "409": errorResponse("Master belongs to studio"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create master service",
        tags: ["services", "masters"],
        parameters: [masterIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProviderServiceCreateInput" },
            },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/ProviderServiceData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
      put: {
        summary: "Update master service",
        tags: ["services", "masters"],
        parameters: [masterIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProviderServiceUpdateInput" },
            },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ProviderServiceData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
      delete: {
        summary: "Delete master service",
        tags: ["services", "masters"],
        parameters: [masterIdParam],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProviderServiceDeleteInput" },
            },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings": {
      get: {
        summary: "List provider bookings for owner",
        tags: ["bookings"],
        parameters: [
          {
            name: "providerId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingListData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Provider not found"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create booking",
        tags: ["bookings"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BookingCreateInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/BookingData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Booking conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings/{id}/confirm": {
      post: {
        summary: "Confirm booking",
        tags: ["bookings"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings/{id}/cancel": {
      post: {
        summary: "Cancel booking",
        tags: ["bookings"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BookingCancelInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/bookings/{id}/reschedule": {
      post: {
        summary: "Reschedule booking",
        tags: ["bookings"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BookingRescheduleInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/masters/{id}/availability": {
      get: {
        summary: "List available slots for master",
        tags: ["schedule", "masters"],
        parameters: [masterIdParam, serviceIdQuery, fromQuery, toQuery, limitQuery],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AvailabilitySlotsData" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/telegram/link": {
      get: {
        summary: "Generate Telegram linking URL",
        tags: ["telegram"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TelegramLinkData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/telegram/status": {
      get: {
        summary: "Get Telegram notification status",
        tags: ["telegram"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TelegramStatusData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/telegram/settings": {
      patch: {
        summary: "Update Telegram notification settings",
        tags: ["telegram"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/TelegramSettingsInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TelegramSettingsData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/telegram/webhook": {
      post: {
        summary: "Telegram webhook (internal)",
        tags: ["telegram", "internal"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { type: "object", additionalProperties: true } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TelegramWebhookData" }),
          "403": errorResponse("Forbidden"),
        },
      },
    },
    "/api/auth/vk/start": {
      get: {
        summary: "Start VK ID authorization flow",
        tags: ["auth", "vk"],
        responses: {
          "307": { description: "Redirect to VK ID" },
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/auth/vk/callback": {
      get: {
        summary: "VK ID authorization callback",
        tags: ["auth", "vk"],
        responses: {
          "307": { description: "Redirect to cabinet" },
          "400": errorResponse("Validation error"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/integrations/vk/start": {
      get: {
        summary: "Start VK ID integration linking",
        tags: ["integrations", "vk"],
        responses: {
          "307": { description: "Redirect to VK ID" },
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/integrations/vk/callback": {
      get: {
        summary: "VK ID integration callback",
        tags: ["integrations", "vk"],
        responses: {
          "307": { description: "Redirect to cabinet" },
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/integrations/vk/status": {
      get: {
        summary: "Get VK integration status",
        tags: ["integrations", "vk"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/VkStatusData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/integrations/vk/disable": {
      post: {
        summary: "Disable VK integration",
        tags: ["integrations", "vk"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/VkDisableData" }),
          "401": errorResponse("Unauthorized"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/me": {
      get: {
        summary: "Get current user profile",
        tags: ["me", "client"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MeData" }),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Update current user profile",
        tags: ["me", "client"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MeUpdateInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MeData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/me/bookings": {
      get: {
        summary: "List current user bookings",
        tags: ["me", "client", "bookings"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BookingListData" }),
          "401": errorResponse("Unauthorized"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/media": {
      get: {
        summary: "List media assets for entity",
        tags: ["media"],
        parameters: [
          {
            name: "entityType",
            in: "query",
            required: true,
            schema: { $ref: "#/components/schemas/MediaEntityType" },
          },
          {
            name: "entityId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "kind",
            in: "query",
            required: false,
            schema: { $ref: "#/components/schemas/MediaKind" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MediaAssetListData" }),
          "400": errorResponse("Validation error"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Upload media asset",
        tags: ["media"],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  entityType: { $ref: "#/components/schemas/MediaEntityType" },
                  entityId: { type: "string" },
                  kind: { $ref: "#/components/schemas/MediaKind" },
                  replaceAssetId: { type: "string" },
                  file: { type: "string", format: "binary" },
                },
                required: ["entityType", "entityId", "kind", "file"],
              },
            },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/MediaAssetData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/media/{id}": {
      delete: {
        summary: "Delete media asset",
        tags: ["media"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/media/file/{id}": {
      get: {
        summary: "Serve media file",
        tags: ["media"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Binary image stream" },
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews": {
      get: {
        summary: "List reviews by target",
        tags: ["reviews"],
        parameters: [
          {
            name: "targetType",
            in: "query",
            required: true,
            schema: { $ref: "#/components/schemas/ReviewTargetType" },
          },
          {
            name: "targetId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100 },
          },
          {
            name: "offset",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 0 },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ReviewListData" }),
          "400": errorResponse("Validation error"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create review for completed booking",
        tags: ["reviews"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReviewCreateInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/ReviewData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Review not allowed"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews/can-leave": {
      get: {
        summary: "Check if current user can leave review for booking",
        tags: ["reviews"],
        parameters: [
          {
            name: "bookingId",
            in: "query",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/CanLeaveReviewData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Booking not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews/{id}": {
      delete: {
        summary: "Delete review (author before reply, or admin after report)",
        tags: ["reviews"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews/{id}/reply": {
      post: {
        summary: "Reply to review (master once)",
        tags: ["reviews"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReviewReplyInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ReviewData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/reviews/{id}/report": {
      post: {
        summary: "Report review (master within 3 days)",
        tags: ["reviews"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReviewReportInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ReviewData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/calendar": {
      get: {
        summary: "Studio unified calendar",
        tags: ["studio", "calendar"],
        parameters: [
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
          { name: "date", in: "query", required: true, schema: { type: "string" } },
          { name: "view", in: "query", required: false, schema: { type: "string", enum: ["day", "week", "month"] } },
          { name: "masterIds", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioCalendarData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/clients": {
      get: {
        summary: "Studio clients aggregated from bookings",
        tags: ["studio", "clients"],
        parameters: [{ name: "studioId", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioClientsData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/finance": {
      get: {
        summary: "Studio finance analytics from booking snapshots",
        tags: ["studio", "finance"],
        parameters: [
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
          { name: "from", in: "query", required: true, schema: { type: "string" } },
          { name: "to", in: "query", required: true, schema: { type: "string" } },
          {
            name: "groupBy",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["masters", "categories", "services"] },
          },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioFinanceData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/blocks": {
      post: {
        summary: "Create studio time block",
        tags: ["studio", "calendar"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateTimeBlockInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/TimeBlockData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/blocks/{id}": {
      patch: {
        summary: "Update studio time block",
        tags: ["studio", "calendar"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateTimeBlockInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/TimeBlockData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Block not found"),
          "500": errorResponse("Internal error"),
        },
      },
      delete: {
        summary: "Delete studio time block",
        tags: ["studio", "calendar"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Block not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/categories": {
      post: {
        summary: "Create studio category",
        tags: ["studio", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioCategoryInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/StudioCategoryData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/categories/{id}": {
      patch: {
        summary: "Rename studio category",
        tags: ["studio", "services"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioCategoryInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/categories/reorder": {
      patch: {
        summary: "Reorder studio categories",
        tags: ["studio", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReorderIdsInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/services": {
      get: {
        summary: "Studio services list with assigned masters",
        tags: ["studio", "services"],
        parameters: [{ name: "studioId", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioServicesData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create studio service",
        tags: ["studio", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioServiceInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/services/{id}": {
      patch: {
        summary: "Update studio service",
        tags: ["studio", "services"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateStudioServiceInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/services/reorder": {
      patch: {
        summary: "Reorder studio services inside category",
        tags: ["studio", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/ReorderIdsInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters": {
      get: {
        summary: "List studio masters",
        tags: ["studio", "masters"],
        parameters: [{ name: "studioId", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioMasterListData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Studio not found"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create local studio master",
        tags: ["studio", "masters"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioMasterInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/services/{id}/assign-master": {
      post: {
        summary: "Assign master to service",
        tags: ["studio", "services"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/AssignMasterInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AssignMasterData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Service not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}": {
      get: {
        summary: "Studio master card details",
        tags: ["studio", "masters"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioMasterData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Update studio master profile",
        tags: ["studio", "masters"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateStudioMasterInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/services": {
      put: {
        summary: "Bulk update master services",
        tags: ["studio", "masters", "services"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/BulkMasterServicesInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule": {
      get: {
        summary: "Get master schedule for studio drawer",
        tags: ["studio", "masters", "schedule"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/StudioMasterScheduleData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule/templates": {
      post: {
        summary: "Create master shift template",
        tags: ["studio", "masters", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateWorkTemplateInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule/day-rules": {
      put: {
        summary: "Bulk upsert day rules",
        tags: ["studio", "masters", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpsertDayRulesInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule/exceptions": {
      post: {
        summary: "Create master schedule exception",
        tags: ["studio", "masters", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateWorkExceptionInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/masters/{id}/schedule/exceptions/{exceptionId}": {
      delete: {
        summary: "Delete master schedule exception",
        tags: ["studio", "masters", "schedule"],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "exceptionId", in: "path", required: true, schema: { type: "string" } },
          { name: "studioId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/day": {
      get: {
        summary: "Master day timeline",
        tags: ["master"],
        parameters: [{ name: "date", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterDayData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/bookings": {
      post: {
        summary: "Create manual booking from master cabinet (solo)",
        tags: ["master", "bookings"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterBookingInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/bookings/{id}/status": {
      patch: {
        summary: "Update booking status from master cabinet",
        tags: ["master", "bookings"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateMasterBookingStatusInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterBookingStatusData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule": {
      get: {
        summary: "Get master schedule for month",
        tags: ["master", "schedule"],
        parameters: [{ name: "month", in: "query", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterScheduleData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule/weekly": {
      get: {
        summary: "Get own weekly schedule",
        tags: ["master", "schedule"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/WeeklyScheduleData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
      put: {
        summary: "Set own weekly schedule",
        tags: ["master", "schedule"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/WeeklyScheduleInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/CountData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule/buffer": {
      get: {
        summary: "Get own booking buffer",
        tags: ["master", "schedule"],
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              bufferBetweenBookingsMin: { type: "integer" },
            },
            required: ["bufferBetweenBookingsMin"],
          }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
      put: {
        summary: "Set own booking buffer",
        tags: ["master", "schedule"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  bufferBetweenBookingsMin: { type: "integer", minimum: 0, maximum: 30 },
                },
                required: ["bufferBetweenBookingsMin"],
              },
            },
          },
        },
        responses: {
          "200": okResponse({
            type: "object",
            properties: {
              bufferBetweenBookingsMin: { type: "integer" },
            },
            required: ["bufferBetweenBookingsMin"],
          }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule/exceptions": {
      post: {
        summary: "Create off-day/shift exception (solo apply, studio request)",
        tags: ["master", "schedule"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterScheduleExceptionInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/MasterApplyOrRequestData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/schedule/exceptions/{id}": {
      delete: {
        summary: "Delete master exception (solo only)",
        tags: ["master", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/blocks": {
      post: {
        summary: "Create master break/block (solo apply, studio request)",
        tags: ["master", "schedule"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterBlockInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/MasterApplyOrRequestData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/blocks/{id}": {
      patch: {
        summary: "Update master block (solo only)",
        tags: ["master", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterBlockInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
      delete: {
        summary: "Delete master block (solo only)",
        tags: ["master", "schedule"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/profile": {
      get: {
        summary: "Get master profile aggregate for cabinet",
        tags: ["master", "profile"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterProfileData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      patch: {
        summary: "Update master profile",
        tags: ["master", "profile"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpdateMasterProfileInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/services": {
      put: {
        summary: "Bulk update master services from cabinet",
        tags: ["master", "services"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/UpsertMasterServicesInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/BulkUpdatedData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/portfolio": {
      get: {
        summary: "List master portfolio items",
        tags: ["master", "portfolio"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/MasterPortfolioListData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Create master portfolio item",
        tags: ["master", "portfolio"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateMasterPortfolioInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/DeleteResult" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/master/portfolio/{id}": {
      delete: {
        summary: "Delete master portfolio item",
        tags: ["master", "portfolio"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/bookings/{id}/move": {
      patch: {
        summary: "Move booking between masters/time slots",
        tags: ["studio", "bookings"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/MoveStudioBookingInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/DeleteResult" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Booking not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/studio/bookings": {
      post: {
        summary: "Create booking from studio calendar",
        tags: ["studio", "bookings"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/CreateStudioBookingInput" } },
          },
        },
        responses: {
          "201": okResponse({ $ref: "#/components/schemas/StudioBookingCreatedData" }, "Created"),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/feed/portfolio": {
      get: {
        summary: "Inspiration portfolio feed",
        tags: ["portfolio", "feed"],
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50 } },
          { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          { name: "q", in: "query", required: false, schema: { type: "string" } },
          { name: "categoryId", in: "query", required: false, schema: { type: "string" } },
          { name: "category", in: "query", required: false, schema: { type: "string" } },
          { name: "tag", in: "query", required: false, schema: { type: "string" } },
          { name: "near", in: "query", required: false, schema: { type: "string" } },
          { name: "masterId", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/PortfolioFeedData" }),
          "400": errorResponse("Validation error"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/portfolio/{id}": {
      get: {
        summary: "Portfolio detail with prefill booking context",
        tags: ["portfolio"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/PortfolioDetailData" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/portfolio/{id}/favorite": {
      post: {
        summary: "Toggle portfolio favorite for current user",
        tags: ["portfolio"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/ToggleFavoriteData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "404": errorResponse("Not found"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/hot-slots": {
      get: {
        summary: "List active hot slots",
        tags: ["hot-slots"],
        parameters: [
          { name: "from", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "to", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "category", in: "query", required: false, schema: { type: "string" } },
          { name: "tag", in: "query", required: false, schema: { type: "string" } },
          { name: "geo", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HotSlotsData" }),
          "400": errorResponse("Validation error"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/provider/hot-slots/rule": {
      get: {
        summary: "Get hot slots rule for current provider",
        tags: ["hot-slots"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HotSlotRuleData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
      post: {
        summary: "Update hot slots rule",
        tags: ["hot-slots"],
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/HotSlotRuleInput" } },
          },
        },
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HotSlotRuleData" }),
          "400": errorResponse("Validation error"),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/admin/hot-slots/run": {
      post: {
        summary: "Run hot slots job",
        tags: ["hot-slots", "admin"],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/HotSlotsRunData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "500": errorResponse("Internal error"),
        },
      },
    },
  },
} as const satisfies OpenApiSpec;

export function getOpenApiSpec() {
  return openApiSpec;
}


type SchemaObject = {
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  properties?: Record<string, SchemaObject>;
  required?: readonly string[];
  items?: SchemaObject;
  enum?: readonly (string | number | boolean)[];
  format?: string;
  minimum?: number;
  maximum?: number;
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
  content: {
    "application/json": {
      schema: SchemaObject;
    };
  };
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
  schema: { type: "string", format: "date-time" },
};

const toQuery: ParameterObject = {
  name: "to",
  in: "query",
  required: true,
  schema: { type: "string", format: "date-time" },
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "BeautyHub API",
    version: "0.1.0",
    description: "Minimal OpenAPI contract for BeautyHub public API.",
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
              { $ref: "#/components/schemas/WeeklyScheduleData" },
              { $ref: "#/components/schemas/CountData" },
              { $ref: "#/components/schemas/DeleteResult" },
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
            required: ["services"],
            properties: {
              services: {
                type: "array",
                items: { $ref: "#/components/schemas/ProviderService" },
              },
            },
          },
        ],
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
        enum: ["PENDING", "CONFIRMED", "CANCELLED"],
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
        required: ["slots"],
        properties: {
          slots: { type: "array", items: { $ref: "#/components/schemas/AvailabilitySlot" } },
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
    },
  },
  paths: {
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
        parameters: [masterIdParam, serviceIdQuery, fromQuery, toQuery],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/AvailabilitySlotsData" }),
          "400": errorResponse("Validation error"),
          "404": errorResponse("Not found"),
          "409": errorResponse("Conflict"),
          "500": errorResponse("Internal error"),
        },
      },
    },
    "/api/masters/{id}/schedule/weekly": {
      get: {
        summary: "Get weekly schedule",
        tags: ["schedule", "masters"],
        parameters: [masterIdParam],
        responses: {
          "200": okResponse({ $ref: "#/components/schemas/WeeklyScheduleData" }),
          "401": errorResponse("Unauthorized"),
          "403": errorResponse("Forbidden"),
          "404": errorResponse("Master not found"),
          "500": errorResponse("Internal error"),
        },
      },
      put: {
        summary: "Set weekly schedule",
        tags: ["schedule", "masters"],
        parameters: [masterIdParam],
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
  },
} as const satisfies OpenApiSpec;

export function getOpenApiSpec() {
  return openApiSpec;
}

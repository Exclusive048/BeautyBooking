import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { ensureStudioRole } from "@/lib/studio/access";
import { ProviderType, StudioRole } from "@prisma/client";

export type ServiceBookingQuestionConfig = {
  id: string;
  text: string;
  required: boolean;
  order: number;
};

export type ServiceBookingConfig = {
  requiresReferencePhoto: boolean;
  questions: ServiceBookingQuestionConfig[];
};

type ServiceAccessContext = {
  id: string;
  studioId: string | null;
  provider: {
    id: string;
    type: ProviderType;
    ownerUserId: string | null;
    studioId: string | null;
  };
};

async function loadService(serviceId: string): Promise<ServiceAccessContext> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true,
      studioId: true,
      provider: {
        select: {
          id: true,
          type: true,
          ownerUserId: true,
          studioId: true,
        },
      },
    },
  });
  if (!service) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }
  return service;
}

async function ensureServiceBookingConfigAccess(service: ServiceAccessContext, userId: string): Promise<void> {
  if (service.provider.type === ProviderType.MASTER) {
    if (service.provider.ownerUserId === userId) return;
    if (service.provider.studioId) {
      const studio = await prisma.studio.findUnique({
        where: { providerId: service.provider.studioId },
        select: { id: true },
      });
      if (studio) {
        await ensureStudioRole({
          studioId: studio.id,
          userId,
          allowed: [StudioRole.OWNER, StudioRole.ADMIN],
        });
        return;
      }
    }
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const studioId =
    service.studioId ??
    (await prisma.studio.findUnique({
      where: { providerId: service.provider.id },
      select: { id: true },
    }))?.id ??
    null;

  if (!studioId) {
    throw new AppError("Studio not found", 404, "STUDIO_NOT_FOUND");
  }

  await ensureStudioRole({
    studioId,
    userId,
    allowed: [StudioRole.OWNER, StudioRole.ADMIN],
  });
}

async function loadServiceConfig(serviceId: string): Promise<ServiceBookingConfig> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: {
      requiresReferencePhoto: true,
      bookingQuestions: {
        select: { id: true, text: true, required: true, order: true },
        orderBy: [{ order: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!service) {
    throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");
  }
  return {
    requiresReferencePhoto: service.requiresReferencePhoto,
    questions: service.bookingQuestions,
  };
}

export async function getMasterServiceBookingConfig(input: {
  serviceId: string;
  userId: string;
}): Promise<ServiceBookingConfig> {
  const service = await loadService(input.serviceId);
  await ensureServiceBookingConfigAccess(service, input.userId);
  return loadServiceConfig(service.id);
}

export async function getPublicServiceBookingConfig(serviceId: string): Promise<ServiceBookingConfig> {
  return loadServiceConfig(serviceId);
}

export async function updateServiceBookingConfig(input: {
  serviceId: string;
  userId: string;
  requiresReferencePhoto: boolean;
  questions: Array<{ id?: string; text: string; required: boolean; order: number }>;
}): Promise<ServiceBookingConfig> {
  const service = await loadService(input.serviceId);
  await ensureServiceBookingConfigAccess(service, input.userId);

  const normalizedQuestions = input.questions.map((question, index) => ({
    id: question.id?.trim() || null,
    text: question.text.trim(),
    required: question.required,
    order: Number.isFinite(question.order) ? question.order : index,
  }));

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.serviceBookingQuestion.findMany({
      where: { serviceId: service.id },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((item) => item.id));
    const incomingIds = new Set(
      normalizedQuestions.map((question) => question.id).filter((value): value is string => Boolean(value))
    );

    for (const id of incomingIds) {
      if (!existingIds.has(id)) {
        throw new AppError("Booking question not found", 404, "BOOKING_QUESTION_NOT_FOUND");
      }
    }

    const toDelete = existing.filter((item) => !incomingIds.has(item.id));
    if (toDelete.length > 0) {
      await tx.serviceBookingQuestion.deleteMany({
        where: { id: { in: toDelete.map((item) => item.id) } },
      });
    }

    await tx.service.update({
      where: { id: service.id },
      data: { requiresReferencePhoto: input.requiresReferencePhoto },
    });

    for (const question of normalizedQuestions) {
      if (question.id) {
        await tx.serviceBookingQuestion.update({
          where: { id: question.id },
          data: {
            text: question.text,
            required: question.required,
            order: question.order,
          },
        });
      } else {
        await tx.serviceBookingQuestion.create({
          data: {
            serviceId: service.id,
            text: question.text,
            required: question.required,
            order: question.order,
          },
        });
      }
    }

    const refreshed = await tx.serviceBookingQuestion.findMany({
      where: { serviceId: service.id },
      select: { id: true, text: true, required: true, order: true },
      orderBy: [{ order: "asc" }, { id: "asc" }],
    });

    return {
      requiresReferencePhoto: input.requiresReferencePhoto,
      questions: refreshed,
    };
  });

  return result;
}

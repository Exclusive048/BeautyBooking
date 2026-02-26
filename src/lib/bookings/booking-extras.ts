import { MediaEntityType, MediaKind } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";

export type BookingAnswerPayload = {
  questionId: string;
  questionText: string;
  answer: string;
};

type ServiceQuestion = {
  id: string;
  text: string;
  required: boolean;
  order: number;
};

type BookingExtrasResult = {
  referencePhotoAssetId: string | null;
  bookingAnswers: BookingAnswerPayload[] | null;
};

function normalizeAnswer(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureQuestionsAnswered(
  questions: ServiceQuestion[],
  answersById: Map<string, BookingAnswerPayload>
) {
  for (const question of questions) {
    if (!question.required) continue;
    const answer = answersById.get(question.id);
    if (!answer || !normalizeAnswer(answer.answer)) {
      throw new AppError("Ответ на обязательный вопрос обязателен.", 400, "BOOKING_ANSWER_REQUIRED");
    }
  }
}

function buildNormalizedAnswers(
  questions: ServiceQuestion[],
  answersById: Map<string, BookingAnswerPayload>
): BookingAnswerPayload[] | null {
  const normalized = questions
    .map((question) => {
      const answer = answersById.get(question.id);
      if (!answer) return null;
      const value = normalizeAnswer(answer.answer);
      if (!value) return null;
      return {
        questionId: question.id,
        questionText: question.text,
        answer: value,
      };
    })
    .filter((item): item is BookingAnswerPayload => item !== null);

  return normalized.length > 0 ? normalized : null;
}

async function validateReferenceAsset(input: {
  assetId: string;
  clientUserId: string;
}): Promise<string> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: input.assetId },
    select: {
      id: true,
      kind: true,
      entityType: true,
      entityId: true,
      deletedAt: true,
      createdByUserId: true,
    },
  });
  if (!asset || asset.deletedAt) {
    throw new AppError("Референс не найден.", 404, "REFERENCE_PHOTO_NOT_FOUND");
  }
  if (asset.kind !== MediaKind.BOOKING_REFERENCE) {
    throw new AppError("Некорректный референс.", 400, "REFERENCE_PHOTO_INVALID");
  }
  if (asset.createdByUserId && asset.createdByUserId !== input.clientUserId) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }
  if (asset.entityType !== MediaEntityType.BOOKING || !asset.entityId.startsWith("pending:")) {
    throw new AppError("Референс уже используется.", 409, "REFERENCE_PHOTO_USED");
  }
  return asset.id;
}

export async function resolveBookingExtras(input: {
  serviceId: string;
  clientUserId: string;
  referencePhotoAssetId?: string | null;
  bookingAnswers?: BookingAnswerPayload[] | null;
}): Promise<BookingExtrasResult> {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: {
      id: true,
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

  const answers = input.bookingAnswers ?? [];
  const answersById = new Map(answers.map((answer) => [answer.questionId, answer]));
  const questionIds = new Set(service.bookingQuestions.map((question) => question.id));

  for (const answerId of answersById.keys()) {
    if (!questionIds.has(answerId)) {
      throw new AppError("Некорректный вопрос.", 400, "BOOKING_ANSWER_INVALID");
    }
  }

  ensureQuestionsAnswered(service.bookingQuestions, answersById);

  if (service.requiresReferencePhoto && !input.referencePhotoAssetId) {
    throw new AppError("Необходимо прикрепить референс.", 400, "REFERENCE_PHOTO_REQUIRED");
  }

  const referencePhotoAssetId = input.referencePhotoAssetId
    ? await validateReferenceAsset({
        assetId: input.referencePhotoAssetId,
        clientUserId: input.clientUserId,
      })
    : null;

  const bookingAnswers = buildNormalizedAnswers(service.bookingQuestions, answersById);

  return {
    referencePhotoAssetId,
    bookingAnswers,
  };
}

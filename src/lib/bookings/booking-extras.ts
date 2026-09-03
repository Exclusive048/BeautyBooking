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
      throw new AppError("Ответьте на вопрос мастера, чтобы записаться.", 400, "BOOKING_ANSWER_REQUIRED");
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

/**
 * Exported for unit testing only (`booking-extras.test.ts`). Production
 * callers consume it via `resolveBookingExtras` below — no other module
 * imports it. Behavior unchanged; the `export` keyword is purely for
 * test discoverability. Mirrors `validateChatAttachmentAsset` pattern
 * (FAST-WINS-BATCH-A — TC-2 tail closure).
 *
 * Contract:
 *   - Asset MUST exist + not be soft-deleted.
 *   - Kind MUST be `BOOKING_REFERENCE`.
 *   - Owner (`createdByUserId`) MUST match the client — no attaching
 *     someone else's upload.
 *   - Asset MUST be unused: `entityType=BOOKING` AND `entityId` starts
 *     with `pending:` (one-shot claim).
 */
export async function validateReferenceAsset(input: {
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
    throw new AppError("Не удалось прикрепить фото-референс. Загрузите его заново.", 400, "REFERENCE_PHOTO_INVALID");
  }
  if (asset.createdByUserId && asset.createdByUserId !== input.clientUserId) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }
  if (asset.entityType !== MediaEntityType.BOOKING || !asset.entityId.startsWith("pending:")) {
    throw new AppError("Референс уже используется.", 409, "REFERENCE_PHOTO_USED");
  }
  return asset.id;
}

export async function resolveBookingExtras(input: {
  serviceId: string;
  // BOOKING-WIDGET-FOUNDATION-A: null for guest bookings. When the
  // service requires a reference photo, guests are rejected — uploads
  // are auth-only (asset is owner-scoped via createdByUserId), so
  // anonymous booking with a reference is structurally impossible
  // today. Phone-scoped guest uploads → backlog.
  clientUserId: string | null;
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
    throw new AppError("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");
  }

  const answers = input.bookingAnswers ?? [];
  const answersById = new Map(answers.map((answer) => [answer.questionId, answer]));
  const questionIds = new Set(service.bookingQuestions.map((question) => question.id));

  for (const answerId of answersById.keys()) {
    if (!questionIds.has(answerId)) {
      throw new AppError("Этот вопрос устарел. Обновите страницу и заполните ответы заново.", 400, "BOOKING_ANSWER_INVALID");
    }
  }

  ensureQuestionsAnswered(service.bookingQuestions, answersById);

  if (service.requiresReferencePhoto && !input.referencePhotoAssetId) {
    throw new AppError("Необходимо прикрепить референс.", 400, "REFERENCE_PHOTO_REQUIRED");
  }

  // Guest cannot attach a reference (uploads are auth-only). If a guest
  // submits an asset id, reject with FORBIDDEN — they should log in.
  if (input.referencePhotoAssetId && !input.clientUserId) {
    throw new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN");
  }

  const referencePhotoAssetId =
    input.referencePhotoAssetId && input.clientUserId
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

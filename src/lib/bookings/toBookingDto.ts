export type NormalizedBookingDto = {
  id: string;
  status: string;
  startAtUtc: string | null;
  endAtUtc: string | null;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  durationMin: number;
};

type ToBookingDtoInput = {
  id: string;
  status: string;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  durationMin?: number | null;
};

function inferDurationMinutes(startAtUtc: Date | null, endAtUtc: Date | null): number {
  if (!startAtUtc || !endAtUtc) return 0;
  const diffMs = endAtUtc.getTime() - startAtUtc.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.round(diffMs / 60000);
}

export function toBookingDto(input: ToBookingDtoInput): NormalizedBookingDto {
  const inferredDuration = inferDurationMinutes(input.startAtUtc, input.endAtUtc);
  const normalizedDuration =
    typeof input.durationMin === "number" && Number.isFinite(input.durationMin) && input.durationMin > 0
      ? Math.floor(input.durationMin)
      : inferredDuration;

  return {
    id: input.id,
    status: input.status,
    startAtUtc: input.startAtUtc ? input.startAtUtc.toISOString() : null,
    endAtUtc: input.endAtUtc ? input.endAtUtc.toISOString() : null,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    serviceName: input.serviceName,
    durationMin: normalizedDuration,
  };
}

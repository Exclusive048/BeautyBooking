import type {
  BookingFlowSlot,
  BookingFlowState,
  ConfirmedBooking,
} from "@/features/booking/components/booking-flow/types";

/**
 * 4-phase booking flow state machine (32b).
 *
 *   selection ─ pick date + time ─→ form ─ submit ─→ success
 *                                                  └→ conflict ──→ selection
 *
 * Plus a `loadConfirmedBooking` transition that fires on mount when
 * the URL contains `?bookingId=` (refresh / share-link case), which
 * jumps straight to `success` without revisiting earlier phases.
 */
export type BookingFlowAction =
  | { type: "selectDate"; dateKey: string }
  | { type: "selectSlot"; slot: BookingFlowSlot }
  | { type: "continueToForm" }
  | { type: "backToSelection" }
  | { type: "setName"; value: string }
  | { type: "setPhone"; value: string }
  | { type: "setComment"; value: string }
  | { type: "setSilentMode"; value: boolean }
  | { type: "setReferencePhoto"; assetId: string | null }
  | { type: "setAnswer"; questionId: string; value: string }
  | { type: "submitSuccess"; booking: ConfirmedBooking }
  | { type: "loadConfirmedBooking"; booking: ConfirmedBooking }
  | { type: "submitConflict" }
  | { type: "retryFromConflict" }
  | { type: "resetService"; serviceContext: Pick<BookingFlowState, "serviceId" | "serviceName" | "servicePrice" | "serviceDurationMin"> };

export function createInitialState(input: {
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  serviceDurationMin: number;
  initialDateKey: string | null;
  prefillPhone: string;
  prefillName: string;
}): BookingFlowState {
  return {
    phase: "selection",
    serviceId: input.serviceId,
    serviceName: input.serviceName,
    servicePrice: input.servicePrice,
    serviceDurationMin: input.serviceDurationMin,
    selectedDateKey: input.initialDateKey,
    selectedSlot: null,
    clientName: input.prefillName,
    clientPhone: input.prefillPhone,
    comment: "",
    silentMode: false,
    referencePhotoAssetId: null,
    bookingAnswers: {},
    confirmedBooking: null,
  };
}

export function bookingFlowReducer(
  state: BookingFlowState,
  action: BookingFlowAction,
): BookingFlowState {
  switch (action.type) {
    case "selectDate":
      return {
        ...state,
        selectedDateKey: action.dateKey,
        // Clear the slot only when switching to a different day — otherwise
        // re-clicking the same chip would wipe the user's selection.
        selectedSlot:
          state.selectedDateKey === action.dateKey ? state.selectedSlot : null,
      };
    case "selectSlot":
      return { ...state, selectedSlot: action.slot };
    case "continueToForm":
      if (!state.selectedSlot) return state;
      return { ...state, phase: "form" };
    case "backToSelection":
      return { ...state, phase: "selection" };
    case "setName":
      return { ...state, clientName: action.value };
    case "setPhone":
      return { ...state, clientPhone: action.value };
    case "setComment":
      return { ...state, comment: action.value };
    case "setSilentMode":
      return { ...state, silentMode: action.value };
    case "setReferencePhoto":
      return { ...state, referencePhotoAssetId: action.assetId };
    case "setAnswer":
      return {
        ...state,
        bookingAnswers: { ...state.bookingAnswers, [action.questionId]: action.value },
      };
    case "submitSuccess":
    case "loadConfirmedBooking":
      return { ...state, phase: "success", confirmedBooking: action.booking };
    case "submitConflict":
      return { ...state, phase: "conflict", selectedSlot: null };
    case "retryFromConflict":
      return { ...state, phase: "selection", selectedSlot: null };
    case "resetService":
      // Service changed in the parent (user picked a different one from the
      // catalogue); drop slot selection but keep contact pre-fill.
      return {
        ...state,
        ...action.serviceContext,
        phase: "selection",
        selectedSlot: null,
        confirmedBooking: null,
      };
    default:
      return state;
  }
}

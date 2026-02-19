export type AlertFn = (message: string, extra?: Record<string, unknown>) => void;

const defaultAlert: AlertFn = (message, extra) => {
  if (extra) {
    console.error("[ALERT]", message, extra);
    return;
  }
  console.error("[ALERT]", message);
};

let currentAlert: AlertFn = defaultAlert;

export function setAlertHandler(fn: AlertFn | null): AlertFn {
  const prev = currentAlert;
  currentAlert = fn ?? defaultAlert;
  return prev;
}

export function alert(message: string, extra?: Record<string, unknown>) {
  try {
    currentAlert(message, extra);
  } catch (error) {
    defaultAlert(message, {
      ...extra,
      handlerError: error instanceof Error ? error.message : error,
    });
  }
}

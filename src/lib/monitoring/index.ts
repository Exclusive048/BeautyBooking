import type { AlertContext } from "@/lib/monitoring/alert";
import { sendAlert } from "@/lib/monitoring/alert";

export { sendAlert };

export const alertCritical = (msg: string, ctx?: AlertContext) => sendAlert("critical", msg, ctx);
export const alertError = (msg: string, ctx?: AlertContext) => sendAlert("error", msg, ctx);
export const alertWarning = (msg: string, ctx?: AlertContext) => sendAlert("warning", msg, ctx);

import type { SystemFlags } from "@/features/admin-cabinet/settings/types";

/** Flags that exist in the system with a runtime consumer **and** an
 * admin-toggleable endpoint. Adding a flag here without backing
 * `SystemConfig` + `/api/admin/system-config` plumbing is a lie — the
 * toggle would do nothing. */
export type RealFlagKey = keyof SystemFlags;

export type RealFlagDefinition = {
  key: RealFlagKey;
  /** Path inside `UI_TEXT.adminPanel.settings.sections.flags.flags.<key>`. */
  labelKey: RealFlagKey;
};

export const REAL_FLAGS: ReadonlyArray<RealFlagDefinition> = [
  { key: "onlinePaymentsEnabled", labelKey: "onlinePaymentsEnabled" },
  { key: "visualSearchEnabled", labelKey: "visualSearchEnabled" },
  { key: "legalDraftMode", labelKey: "legalDraftMode" },
];

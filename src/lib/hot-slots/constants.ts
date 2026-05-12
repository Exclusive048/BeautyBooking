// Trigger hours = how close to the slot start the discount activates.
// Spec 25-SETTINGS-B added the short-window options (1/2/3/6 h) for
// last-minute "hot" slots; the legacy 12/24/48 h values are kept so the
// detailed hot-slots page and existing rows continue to validate.
export const HOT_SLOT_TRIGGER_HOURS = [1, 2, 3, 6, 12, 24, 48] as const;
// Discount percentages — added 15% in 25-SETTINGS-B alongside the
// existing 10/20/30 set. Order is ascending; UI may render any subset.
export const HOT_SLOT_PERCENT_VALUES = [10, 15, 20, 30] as const;
export const HOT_SLOT_FIXED_MIN = 100;
export const HOT_SLOT_FIXED_MAX = 5000;
export const HOT_SLOT_REBOOK_BLOCK_HOURS = 24;

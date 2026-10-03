export type CategoryDisplayStatus = "APPROVED" | "PENDING";

/** Synthetic token used as `categoryId` for the "Без категории" bucket. */
export const UNCATEGORIZED_KEY = "__uncategorized__";

/**
 * CATEGORY-UNIFICATION-A: categories are GlobalCategory rows in the
 * new flow — APPROVED visible to everyone + own-PENDING visible only
 * to the proposing user. Plus a synthetic "Без категории" bucket for
 * legacy / orphan services without `globalCategoryId`.
 */
export type StudioServiceCategoryRow = {
  /** GlobalCategory id or the `UNCATEGORIZED_KEY` token. */
  id: string;
  title: string;
  /** Смайлик категории; у «Без категории» — `null`. */
  icon: string | null;
  servicesCount: number;
  /** "uncategorized" for the synthetic bucket. */
  status: CategoryDisplayStatus | "uncategorized";
};

export type StudioServiceMasterChip = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

export type StudioServiceListItem = {
  id: string;
  name: string;
  durationMin: number;
  priceKopeks: number;
  /** GlobalCategory id, or `null` for uncategorized. */
  categoryId: string | null;
  isActive: boolean;
  bookings30d: number;
  masters: StudioServiceMasterChip[];
};

/** Category option for picker dropdowns (add-service, detail panel). */
export type StudioCategoryPickerOption = {
  id: string;
  name: string;
  /** Смайлик категории — пункт выбора подписывается «💅 Маникюр». */
  icon: string | null;
  status: CategoryDisplayStatus;
};

export type StudioServicesKpis = {
  totalServices: number;
  totalCategories: number;
  popularServiceName: string | null;
  popularBookings30d: number;
  averageCheckKopeks: number;
  servicesWithoutMaster: number;
};

export type StudioServiceDetail = StudioServiceListItem & {
  description: string | null;
  assignedMasters: StudioServiceMasterChip[];
  availableMasters: StudioServiceMasterChip[];
  stats30d: {
    bookingsCount: number;
    revenueKopeks: number;
  };
};

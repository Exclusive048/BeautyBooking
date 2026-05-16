export type StudioServiceCategoryRow = {
  id: string;
  title: string;
  servicesCount: number;
  sortOrder: number;
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
  categoryId: string | null;
  isActive: boolean;
  bookings30d: number;
  masters: StudioServiceMasterChip[];
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

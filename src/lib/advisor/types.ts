export type AdvisorAction = {
  label: string;
  href: string;
};

export type AdvisorInsight = {
  id: string;
  weight: number;
  title: string;
  message: string;
  action?: AdvisorAction;
};

export type MasterStats = {
  hasAvatar: boolean;
  hasDescription: boolean;
  portfolioCount: number;
  totalReviews: number;
  ratingAvg: number;
  bookingsLast30Days: number;
  noShowRate: number;
  hasDeadTimeSlots: boolean;
  newClientsLast30Days: number;
  hasActiveSlots: boolean;
  atRiskClientsCount: number;
  lowRatedService: { name: string; rating: number } | null;
  workingDaysPerWeek: number;
  servicesWithoutPriceCount: number;
};

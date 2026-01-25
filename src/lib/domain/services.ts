export type ServiceInput = {
  name: string;
  durationMin: number;
  price: number;
};

export type ServiceUpdate = {
  name?: string;
  durationMin?: number;
  price?: number;
};

export type ServiceRecord = {
  id: string;
  providerId: string;
  name: string;
  durationMin: number;
  price: number;
};

export type MasterServiceOverride = {
  priceOverride?: number | null;
  durationOverrideMin?: number | null;
  isEnabled?: boolean;
};

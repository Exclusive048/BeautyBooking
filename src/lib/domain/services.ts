export type ServiceInput = {
  name: string;
  durationMin: number;
  price: number;
  onlinePaymentEnabled?: boolean;
};

export type ServiceUpdate = {
  name?: string;
  durationMin?: number;
  price?: number;
  onlinePaymentEnabled?: boolean;
};

export type ServiceRecord = {
  id: string;
  providerId: string;
  name: string;
  durationMin: number;
  price: number;
  isEnabled: boolean;
  onlinePaymentEnabled: boolean;
};

export type MasterServiceOverride = {
  priceOverride?: number | null;
  durationOverrideMin?: number | null;
  isEnabled?: boolean;
};

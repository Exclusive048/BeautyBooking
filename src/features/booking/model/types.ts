export type BookingService = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
};

export type BookingMeUser = {
  id: string;
  roles: string[];
  displayName: string | null;
  phone: string | null;
  email: string | null;
};

export type BookingWidgetProps = {
  providerId: string;
  services: BookingService[];
  defaultServiceId?: string;
};

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHANGE_REQUESTED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "FINISHED"
  | "NEW"
  | "PREPAID"
  | "STARTED"
  | "CANCELLED"
  | "NO_SHOW";

export type BookingItem = {
  id: string;
  slotLabel: string;
  clientName: string;
  clientPhone: string;
  comment: string | null;
  status: BookingStatus;
  createdAt: string;
  service: BookingService;
  provider: {
    id: string;
    name: string;
    type: "MASTER" | "STUDIO";
  };
};

export type SlotGroup = {
  id: string;
  label: string;
  items: string[];
  defaultOpen?: boolean;
};

export type Slot = {
  id: string;
  label: string;
};

export type NotificationEvent = {
  id: string;
  type: string;
  title: string;
  body: string;
  payloadJson: unknown;
  createdAt: string;
};

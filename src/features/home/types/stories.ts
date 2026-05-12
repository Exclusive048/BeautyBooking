export type StoryItem = {
  id: string;
  mediaUrl: string;
  createdAt: string; // ISO
};

export type StoriesGroup = {
  masterId: string;
  providerName: string;
  providerType: "MASTER" | "STUDIO";
  username: string | null;
  avatarUrl: string | null;
  items: StoryItem[];
};

export type StoriesPayload = {
  groups: StoriesGroup[];
  cachedAt: string; // ISO
};

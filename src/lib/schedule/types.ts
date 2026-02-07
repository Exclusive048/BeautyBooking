export type DayPlan = {
  isWorking: boolean;
  workingIntervals: Array<{ start: string; end: string }>;
  breaks: Array<{ start: string; end: string }>;
  meta: {
    source: "weekly-template" | "override" | "cycle";
    templateId?: string;
    reason?: "out_of_publish_horizon";
    publishedUntilLocal?: string;
  };
};

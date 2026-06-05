import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

type Props = {
  title: string;
  hint: string;
};

export function BillingTabEmpty({ title, hint }: Props) {
  return <EmptyState icon={Inbox} title={title} description={hint} />;
}

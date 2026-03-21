import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function StudioSettingsLayout({ children }: Props) {
  return <>{children}</>;
}

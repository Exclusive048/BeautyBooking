import { permanentRedirect } from "next/navigation";

// Hot slots are now integrated as a filter in /catalog?hot=true
export default function HotSlotsRoute() {
  permanentRedirect("/catalog?hot=true");
}

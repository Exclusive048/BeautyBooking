import Link from "next/link";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BECOME_MASTER_HREF } from "@/lib/auth/available-cabinets";
import * as UI_TEXT from "@/lib/ui/text";

/**
 * NAV-BECOME-MASTER-01 — «Стать мастером» у клиента без кабинета, в слоте
 * ярлыков кабинетов шапки (`topbar.tsx`). Условие показа считает шапка
 * (`shouldOfferBecomeMaster` + отсутствие ярлыков) — здесь только вид.
 *
 * Высота 40px — как у ярлыков и соседних иконок шапки; `size="none"` + свои
 * `h-10 px-4`: размер задан целиком здесь, а не перебиванием `h-9` у
 * `size="sm"` (так было надёжно и при плоском `cn`, до tailwind-merge).
 */
export function BecomeMasterShortcut() {
  return (
    <Button asChild variant="secondary" size="none" className="h-10 px-4 text-sm">
      <Link href={BECOME_MASTER_HREF}>
        <Scissors className="h-4 w-4 text-accent-text" aria-hidden />
        {UI_TEXT.nav.becomeMaster}
      </Link>
    </Button>
  );
}

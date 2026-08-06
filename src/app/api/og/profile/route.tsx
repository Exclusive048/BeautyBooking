import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import { BRAND_COLORS, brandGradientCss, withAlpha } from "@/lib/ui/brand-colors";

export const runtime = "nodejs";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

const BRAND_NAME = "МастерРядом";
const BRAND_DOMAIN = "мастеррядом.online";

/**
 * UI-04: satori понимает только инлайновые стили, поэтому цвета берутся из
 * `BRAND_COLORS` (зеркало `globals.css`), а не пишутся литералами.
 *
 * Композиция — та же, что была: тёплый градиент-подложка и тёмная карточка
 * поверх. Разница в том, что подложка теперь бренд-градиент (бордо → малина →
 * глубокий бордо), а карточка — `--brand-pane`, бренд-поверхность, тёмная в
 * обеих темах. Оба бордовых слоя близки по светлоте, поэтому край карточки
 * держит кремовая волосяная граница, а не разница фонов. Светлые заливки
 * (аватар-заглушка, CTA-пилюля) — тот же приём, что `Button variant="inverted"`
 * на фиксированно-тёмных бренд-поверхностях продукта.
 */
const BACKDROP = brandGradientCss();
const SURFACE_BG = withAlpha(BRAND_COLORS.brandPane, 0.92);
const SURFACE_BORDER = withAlpha(BRAND_COLORS.darkTextMain, 0.12);
const TEXT_MAIN = BRAND_COLORS.darkTextMain;
const TEXT_SEC = BRAND_COLORS.darkTextSecondary;
const ACCENT = BRAND_COLORS.brandAccent;

type ProviderData = {
  name: string;
  type: "MASTER" | "STUDIO";
  avatarUrl: string | null;
  description: string | null;
  district: string | null;
  ratingAvg: number;
  ratingCount: number;
  services: { name: string }[];
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function buildSubtitle(provider: ProviderData): string {
  const parts: string[] = [];
  const serviceNames = provider.services
    .map((s) => s.name)
    .slice(0, 3);
  if (serviceNames.length > 0) {
    parts.push(serviceNames.join(" · "));
  }
  if (provider.district) {
    parts.push(provider.district);
  }
  return parts.join("  ·  ") || (provider.type === "STUDIO" ? "Студия красоты" : "Мастер красоты");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username")?.trim().toLowerCase();

  if (!username) {
    return new Response("Missing username", { status: 400 });
  }

  const provider = await prisma.provider.findFirst({
    where: {
      OR: [
        { publicUsername: username },
        { publicUsernameAliases: { some: { username } } },
      ],
      isPublished: true,
    },
    select: {
      name: true,
      type: true,
      avatarUrl: true,
      description: true,
      district: true,
      ratingAvg: true,
      ratingCount: true,
      services: {
        where: { isActive: true },
        select: { name: true },
        take: 5,
      },
    },
  });

  if (!provider) {
    return new Response("Provider not found", { status: 404 });
  }

  const subtitle = buildSubtitle(provider);
  const initials = getInitials(provider.name);
  const hasRating = provider.ratingCount > 0;
  const ratingText = hasRating
    ? `${provider.ratingAvg.toFixed(1)} ★  ·  ${provider.ratingCount} отзывов`
    : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: BACKDROP,
          fontFamily: "sans-serif",
        }}
      >
        {/* Content card */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            margin: "40px",
            marginTop: "auto",
            padding: "40px 48px",
            borderRadius: "28px",
            background: SURFACE_BG,
            border: `1px solid ${SURFACE_BORDER}`,
            backdropFilter: "blur(20px)",
            gap: "0",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            {/* Avatar */}
            {provider.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={provider.avatarUrl}
                alt=""
                width={88}
                height={88}
                style={{
                  width: "88px",
                  height: "88px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `3px solid ${ACCENT}`,
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: "88px",
                  height: "88px",
                  borderRadius: "50%",
                  background: BRAND_COLORS.surfaceCard,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "32px",
                  fontWeight: 700,
                  color: BRAND_COLORS.brandFrom,
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
            )}

            {/* Info */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "36px",
                  fontWeight: 700,
                  color: TEXT_MAIN,
                  lineHeight: 1.2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {provider.name}
              </div>
              <div
                style={{
                  fontSize: "18px",
                  color: TEXT_SEC,
                  lineHeight: 1.4,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {subtitle}
              </div>
              {hasRating ? (
                <div style={{ fontSize: "16px", color: ACCENT, lineHeight: 1.4, marginTop: "2px" }}>
                  {ratingText}
                </div>
              ) : null}
            </div>
          </div>

          {/* Footer: brand + CTA */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "24px",
              paddingTop: "20px",
              borderTop: `1px solid ${SURFACE_BORDER}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  color: TEXT_MAIN,
                }}
              >
                {BRAND_NAME}
              </div>
              <div style={{ fontSize: "14px", color: TEXT_SEC }}>{BRAND_DOMAIN}</div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px 20px",
                borderRadius: "12px",
                background: BRAND_COLORS.surfaceCard,
                fontSize: "16px",
                fontWeight: 600,
                color: BRAND_COLORS.brandFrom,
              }}
            >
              Записаться онлайн
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}

import Image from "next/image";
import type { CSSProperties } from "react";

type FocalImageProps = {
  src: string;
  alt: string;
  // Legacy focal point props — kept for call-site compatibility but ignored
  focalX?: number | null;
  focalY?: number | null;
  cropX?: number | null;
  cropY?: number | null;
  cropWidth?: number | null;
  cropHeight?: number | null;
  // Fixed-size mode (for avatars with known dimensions)
  width?: number;
  height?: number;
  // Fill mode: fills the parent (parent must have position:relative + explicit dimensions)
  // Used automatically when width/height are not provided
  sizes?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
  className?: string;
  style?: CSSProperties;
};

function buildObjectPosition(
  cropX: number | null | undefined,
  cropY: number | null | undefined,
  cropWidth: number | null | undefined,
  cropHeight: number | null | undefined,
): string {
  if (cropX != null && cropY != null && cropWidth != null && cropHeight != null) {
    const cx = Math.round((cropX + cropWidth / 2) * 100);
    const cy = Math.round((cropY + cropHeight / 2) * 100);
    return `${cx}% ${cy}%`;
  }
  return "center";
}

/**
 * Returns false unconditionally — kept as a stub for call-site compatibility.
 *
 * Historically this returned `true` for /api/media/* URLs because the route
 * issued a 302 redirect to S3, which Next.js Image Optimizer doesn't handle
 * reliably (received-null errors). Since 06-MEDIA-PIPELINE the route streams
 * bytes directly with proper Content-Type and Cache-Control, so the optimizer
 * works as expected and `unoptimized={true}` is no longer needed.
 *
 * Component preserved for backward-compat with ~45 call sites — migrate to
 * <Image> from next/image directly when touching them.
 */
function needsUnoptimized(src: string): boolean {
  // Returns false since /api/media/file/{id} now streams properly (was 302).
  // Component preserved for backward-compat with 45 usages — migrate to <Image> directly.
  void src;
  return false;
}

/**
 * @deprecated Use <Image> from next/image directly. This wrapper exists only
 *   to keep the legacy call sites compiling — it no longer adds any value.
 */
export function FocalImage({
  src,
  alt,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  width,
  height,
  sizes,
  priority,
  loading,
  className,
  style,
}: FocalImageProps) {
  const objectPosition = buildObjectPosition(cropX, cropY, cropWidth, cropHeight);
  const combinedStyle: CSSProperties = { ...style, objectPosition };
  const unoptimized = needsUnoptimized(src);

  if (width && height) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes ?? `${width}px`}
        priority={priority}
        loading={loading}
        className={className}
        style={combinedStyle}
        unoptimized={unoptimized}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? "100vw"}
      priority={priority}
      loading={loading}
      className={className}
      style={combinedStyle}
      unoptimized={unoptimized}
    />
  );
}

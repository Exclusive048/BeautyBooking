import Image from "next/image";
import type { CSSProperties } from "react";
import { focalPointToObjectPosition } from "@/lib/media/focal-point";

type FocalImageProps = {
  src: string;
  alt: string;
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
  focalX: number | null | undefined,
  focalY: number | null | undefined,
): string {
  // Crop data takes priority: position the focal center of the crop area
  if (cropX != null && cropY != null && cropWidth != null && cropHeight != null) {
    const cx = Math.round((cropX + cropWidth / 2) * 100);
    const cy = Math.round((cropY + cropHeight / 2) * 100);
    return `${cx}% ${cy}%`;
  }
  // Fall back to legacy focal point
  return focalPointToObjectPosition(focalX, focalY);
}

export function FocalImage({
  src,
  alt,
  focalX,
  focalY,
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
  const objectPosition = buildObjectPosition(cropX, cropY, cropWidth, cropHeight, focalX, focalY);
  const combinedStyle: CSSProperties = { ...style, objectPosition };

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
    />
  );
}

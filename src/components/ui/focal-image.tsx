import Image from "next/image";
import type { CSSProperties } from "react";
import { focalPointToObjectPosition } from "@/lib/media/focal-point";

type FocalImageProps = {
  src: string;
  alt: string;
  focalX?: number | null;
  focalY?: number | null;
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

export function FocalImage({
  src,
  alt,
  focalX,
  focalY,
  width,
  height,
  sizes,
  priority,
  loading,
  className,
  style,
}: FocalImageProps) {
  const objectPosition = focalPointToObjectPosition(focalX, focalY);
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

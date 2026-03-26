/* eslint-disable @next/next/no-img-element -- custom focal-point positioning via object-position requires direct img */
import type { ImgHTMLAttributes } from "react";
import { focalPointToObjectPosition } from "@/lib/media/focal-point";

type FocalImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string;
  alt: string;
  focalX?: number | null;
  focalY?: number | null;
};

export function FocalImage({ src, alt, focalX, focalY, style, ...rest }: FocalImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      {...rest}
      style={{
        ...style,
        objectPosition: focalPointToObjectPosition(focalX, focalY),
      }}
    />
  );
}

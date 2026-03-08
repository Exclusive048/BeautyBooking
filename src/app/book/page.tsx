import { Suspense } from "react";
import { BookingSkeleton } from "@/components/blocks/skeletons/BookingSkeleton";
import BookFromPortfolioClient from "./book-client";

export default function BookFromPortfolioPage() {
  return (
    <Suspense fallback={<BookingSkeleton />}>
      <BookFromPortfolioClient />
    </Suspense>
  );
}

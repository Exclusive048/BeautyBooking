import { Suspense } from "react";
import BookFromPortfolioClient from "./book-client";

export default function BookFromPortfolioPage() {
  return (
    <Suspense fallback={null}>
      <BookFromPortfolioClient />
    </Suspense>
  );
}

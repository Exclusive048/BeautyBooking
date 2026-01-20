import "@/app/globals.css";

export const metadata = {
  title: "BeautyHub",
  description: "Запись к мастерам",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

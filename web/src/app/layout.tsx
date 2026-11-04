import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperTrail: Evaluated Research-Paper Assistant",
  description:
    "An evaluated, grounded research-paper assistant with verified citations and abstention.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased dark">
      <body className="bg-[#030407] text-[#f8fafc] font-serif selection:bg-[#d4ff24] selection:text-[#030407] min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}

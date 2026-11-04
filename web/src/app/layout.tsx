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
    <html lang="en" className="h-full antialiased">
      <body className="bg-[#fff8f4] text-[#271904] font-serif selection:bg-[#ffe4c5] min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}

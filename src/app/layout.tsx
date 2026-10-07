import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import { auth } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Test Manager",
  description: "Tu propio Test Manager: casos, ejecuciones, defectos y reportes.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <html lang="es" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <Providers>
          {session?.user && <Navbar user={session.user} />}
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}


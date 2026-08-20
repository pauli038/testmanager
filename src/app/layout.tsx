import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import { auth } from "@/lib/auth";

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
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50">
        <Providers>
          {session?.user && <Navbar user={session.user} />}
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}


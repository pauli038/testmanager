import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "@/lib/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Server-side only (the edge proxy uses authConfig without this): reload
    // the user on every request so role changes apply immediately and
    // sessions of users that no longer exist are signed out.
    jwt: async ({ token, user }) => {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        return token;
      }
      if (typeof token.id !== "string") return null;
      const current = await db.query.users.findFirst({
        where: eq(users.id, token.id),
      });
      if (!current) return null;
      token.role = current.role;
      token.name = current.name;
      token.email = current.email;
      return token;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email.toLowerCase().trim()),
        });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});

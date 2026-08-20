import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "lead" | "tester";
    } & DefaultSession["user"];
  }
  interface User {
    id: string;
    role: "admin" | "lead" | "tester";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "lead" | "tester";
  }
}

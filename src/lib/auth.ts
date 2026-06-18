import { cache } from "react";
import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { defaultRoles } from "better-auth/plugins/admin/access";
import { username } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  trustedOrigins,
  advanced: {
    useSecureCookies: process.env.SECURE_COOKIES === "true",
  },
  emailAndPassword: { enabled: true },
  plugins: [
    username(),
    admin({
      defaultRole: "member",
      adminRoles: ["admin"],
      roles: {
        admin: defaultRoles.admin,
        member: defaultRoles.user,
      },
    }),
  ],
});

/**
 * Request-scoped session lookup. Wrapped in React `cache()` so that multiple
 * callers within a single server render (e.g. a layout, its page, and any
 * server actions/helpers they invoke) share one auth lookup instead of
 * re-querying the session per call.
 */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

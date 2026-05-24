import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { admin } from "better-auth/plugins";
import { defaultRoles } from "better-auth/plugins/admin/access";
import { username } from "better-auth/plugins";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "sqlite" }),
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

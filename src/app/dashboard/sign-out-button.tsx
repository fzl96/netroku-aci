"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await authClient.signOut();
        router.push("/signin");
        router.refresh();
      }}
      className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
    >
      Sign out
    </button>
  );
}

// src/lib/apic/client.ts
import { Agent, fetch } from "undici";

// APIC commonly uses self-signed certificates — skip verification for internal tooling
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export interface ApicRequestInit {
  method?: string;
  body?: string;
  token?: string;
}

export async function apicFetch(
  host: string,
  path: string,
  { method = "GET", body, token }: ApicRequestInit = {},
): Promise<Response> {
  // Validate host is a plain hostname/IP — no protocol, path, or port tricks
  if (!/^[a-zA-Z0-9.\-]+(?::\d+)?$/.test(host)) {
    throw new Error(`Invalid APIC host: "${host}"`);
  }

  const url = `https://${host}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Cookie"] = `APIC-cookie=${token}`;

  return fetch(url, {
    method,
    headers,
    body,
    dispatcher: insecureAgent,
  }) as unknown as Promise<Response>;
}

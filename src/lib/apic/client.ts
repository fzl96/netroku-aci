import https from "node:https";

// APIC commonly uses self-signed certificates — skip verification for internal tooling
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

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

  const parsed = new URL(`https://${host}${path}`);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Cookie"] = `APIC-cookie=${token}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method,
        headers,
        agent: insecureAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode,
              headers: res.headers as HeadersInit,
            }),
          );
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

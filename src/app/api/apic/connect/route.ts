import { apicFetch } from '@/lib/apic/client'

export async function POST(request: Request) {
  let host: string, username: string, password: string
  try {
    ;({ host, username, password } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!host?.trim() || !username?.trim() || !password) {
    return Response.json({ error: 'host, username and password are required' }, { status: 400 })
  }

  if (!/^[a-zA-Z0-9.\-]+(?::\d+)?$/.test(host.trim())) {
    return Response.json({ error: 'Invalid host format' }, { status: 400 })
  }

  try {
    const res = await apicFetch(host, '/api/aaaLogin.json', {
      method: 'POST',
      body: JSON.stringify({
        aaaUser: { attributes: { name: username, pwd: password } },
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return Response.json({ error: `APIC authentication failed: ${text.slice(0, 200)}` }, { status: 401 })
    }

    const data = await res.json() as {
      imdata: Array<{ aaaLogin?: { attributes: { token: string } } }>
    }
    const token = data.imdata[0]?.aaaLogin?.attributes?.token
    if (!token) return Response.json({ error: 'No token in APIC response' }, { status: 500 })

    return Response.json({ token, host })
  } catch (err) {
    return Response.json({
      error: err instanceof Error ? err.message : 'Network error connecting to APIC',
    }, { status: 502 })
  }
}

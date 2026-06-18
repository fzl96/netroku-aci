import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { apicFetch } from '@/lib/apic/client'

async function testLogin(host: string, username: string, password: string): Promise<void> {
  const res = await apicFetch(host, '/api/aaaLogin.json', {
    method: 'POST',
    body: JSON.stringify({ aaaUser: { attributes: { name: username, pwd: password } } }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Authentication failed: ${text.slice(0, 200)}`)
  }
  const data = await res.json() as { imdata: Array<{ aaaLogin?: { attributes: { token: string } } }> }
  if (!data.imdata[0]?.aaaLogin?.attributes?.token) {
    throw new Error('No token returned by APIC')
  }
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { host?: string; username?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  try {
    const { host, username, password } = body
    if (!host?.trim() || !username?.trim() || !password) {
      return Response.json({ error: 'host, username and password are required' }, { status: 400 })
    }
    await testLogin(host.trim(), username.trim(), password)

    return Response.json({ ok: true })
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : 'Connection failed' },
      { status: 502 },
    )
  }
}

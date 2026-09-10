import { getSession } from '@/lib/auth'
import { ApicHostReadError, getApicHosts } from '@/lib/apic-hosts/query'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/AppSidebar'
import { MobileTopBar } from '@/components/MobileTopBar'
import { ApicHostsProvider } from '@/components/ApicHostsProvider'
import { NavigationScopeProvider } from '@/components/NavigationScopeProvider'
import { cookies } from 'next/headers'
import { APP_MAIN_CLS } from '@/lib/ui-classes'
import type { NavigationScope } from '@/lib/navigation-scope'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const role = session?.user.role === 'admin' ? 'admin' : 'member'
  // The proxy middleware already guarantees a session on every reachable
  // (app) route; this fallback only protects the shell if that ever changes.
  let apicHosts: Awaited<ReturnType<typeof getApicHosts>> = []
  try {
    apicHosts = await getApicHosts()
  } catch (error) {
    if (!(error instanceof ApicHostReadError)) throw error
    console.error('[apic-hosts] failed to load hosts for the app shell', error)
  }
  const cookieStore = await cookies()
  const initialScope: NavigationScope =
    cookieStore.get('netroku_scope')?.value === 'legacy' ? 'legacy' : 'aci'

  return (
    <TooltipProvider>
      <SidebarProvider>
        <ApicHostsProvider hosts={apicHosts}>
          <NavigationScopeProvider initialScope={initialScope}>
            <AppSidebar role={role} />
            <main className={APP_MAIN_CLS}>
              <MobileTopBar />
              {children}
            </main>
          </NavigationScopeProvider>
        </ApicHostsProvider>
      </SidebarProvider>
    </TooltipProvider>
  )
}

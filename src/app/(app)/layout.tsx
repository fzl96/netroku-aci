import { getSession } from '@/lib/auth'
import { getApicHosts } from '@/actions/apic-hosts'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/AppSidebar'
import { MobileTopBar } from '@/components/MobileTopBar'
import { ApicHostsProvider } from '@/components/ApicHostsProvider'
import { cookies } from 'next/headers'
import { APP_MAIN_CLS } from '@/lib/ui-classes'
import type { NavigationScope } from '@/lib/navigation-scope'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const role = session?.user.role === 'admin' ? 'admin' : 'member'
  const apicHosts = await getApicHosts()
  const cookieStore = await cookies()
  const initialScope: NavigationScope =
    cookieStore.get('netroku_scope')?.value === 'legacy' ? 'legacy' : 'aci'

  return (
    <TooltipProvider>
      <SidebarProvider>
        <ApicHostsProvider hosts={apicHosts}>
          <AppSidebar role={role} initialScope={initialScope} />
          <main className={APP_MAIN_CLS}>
            <MobileTopBar initialScope={initialScope} />
            {children}
          </main>
        </ApicHostsProvider>
      </SidebarProvider>
    </TooltipProvider>
  )
}

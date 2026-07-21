import { getSession } from '@/lib/auth'
import { getApicHosts } from '@/actions/apic-hosts'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/AppSidebar'
import { MobileTopBar } from '@/components/MobileTopBar'
import { ApicHostsProvider } from '@/components/ApicHostsProvider'
import { cookies } from 'next/headers'
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
          <main className="flex-1 overflow-y-auto bg-background">
            <MobileTopBar initialScope={initialScope} />
            {children}
          </main>
        </ApicHostsProvider>
      </SidebarProvider>
    </TooltipProvider>
  )
}

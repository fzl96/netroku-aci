import { getSession } from '@/lib/auth'
import { getApicHosts } from '@/actions/apic-hosts'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/AppSidebar'
import { ApicHostsProvider } from '@/components/ApicHostsProvider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const role = session?.user.role === 'admin' ? 'admin' : 'member'
  const apicHosts = await getApicHosts()

  return (
    <TooltipProvider>
      <SidebarProvider>
        <ApicHostsProvider hosts={apicHosts}>
          <AppSidebar role={role} />
          <main className="flex-1 overflow-y-auto bg-background">
            {children}
          </main>
        </ApicHostsProvider>
      </SidebarProvider>
    </TooltipProvider>
  )
}

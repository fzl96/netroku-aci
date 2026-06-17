import { getSession } from '@/lib/auth'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from '@/components/AppSidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  const role = session?.user.role === 'admin' ? 'admin' : 'member'

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar role={role} />
        <main className="flex-1 overflow-y-auto bg-background">
          {children}
        </main>
      </SidebarProvider>
    </TooltipProvider>
  )
}

import { Suspense } from 'react'
import { UsersResults } from './users-results'
import { UsersResultsSkeleton } from './users-skeleton'

export function UsersView() {
  return (
    <div className="min-h-full bg-background">
      <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="px-8 h-16 flex items-center">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Users</h1>
            <p className="text-xs text-subtle mt-0.5">Manage application access and roles</p>
          </div>
        </div>
      </div>
      <Suspense fallback={<UsersResultsSkeleton />}>
        <UsersResults />
      </Suspense>
    </div>
  )
}

import { Suspense } from 'react'
import { UsersResults } from './users-results'
import { UsersResultsSkeleton } from './users-skeleton'

export function UsersView() {
  return (
    <Suspense fallback={<UsersResultsSkeleton />}>
      <UsersResults />
    </Suspense>
  )
}

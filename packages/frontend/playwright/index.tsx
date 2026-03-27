import type { AccountProfile } from '@ih3t/shared'
import { queryKeys } from '@ih3t/shared'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeMount } from '@playwright/experimental-ct-react/hooks'
import { MemoryRouter } from 'react-router'
import '../src/index.css'
import 'react-toastify/dist/ReactToastify.css'
import { createQueryClient } from '../src/query/queryClient'

type ComponentTestHooksConfig = {
  seedAccount?: boolean
  accountUser?: AccountProfile | null
  renderedAt?: number
}

beforeMount(async ({ App, hooksConfig }) => {
  const testHooksConfig = hooksConfig as ComponentTestHooksConfig | undefined
  const queryClient = createQueryClient()

  if (testHooksConfig?.seedAccount) {
    queryClient.setQueryData(queryKeys.account, {
      user: testHooksConfig.accountUser ?? null,
    })
  }

  if (typeof testHooksConfig?.renderedAt === 'number') {
    window.__IH3T_RENDERED_AT__ = testHooksConfig.renderedAt
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
})

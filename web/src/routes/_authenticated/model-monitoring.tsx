import { createFileRoute, redirect } from '@tanstack/react-router'

import { ModelMonitoring } from '@/features/channels/model-monitoring'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/model-monitoring')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: ModelMonitoring,
})

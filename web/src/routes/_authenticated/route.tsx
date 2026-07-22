/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

import { AuthenticatedLayout } from '@/components/layout'
import { ensureFreshAccessToken } from '@/lib/auth-session'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const outcome = await ensureFreshAccessToken()
    if (outcome.kind === 'authenticated') return

    const { auth } = useAuthStore.getState()
    const hasIdentity = Boolean(auth.user && auth.session)

    // Temporary network blips during token refresh must not kick the user out
    // or replace the dashboard with a full-page error. Keep the shell; the
    // next successful request/refresh will recover the access token.
    if (outcome.kind === 'transient_error' && hasIdentity) {
      return
    }

    // Access token may still be valid for a few seconds even when refresh failed.
    if (
      auth.user &&
      auth.accessToken &&
      auth.accessExpiresAt &&
      auth.accessExpiresAt > Math.floor(Date.now() / 1000)
    ) {
      return
    }

    throw redirect({
      to: '/sign-in',
      search: { redirect: location.href },
    })
  },
  component: AuthenticatedLayout,
})

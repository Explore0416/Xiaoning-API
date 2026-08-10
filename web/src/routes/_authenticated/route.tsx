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
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ location }) => {
    const { auth } = useAuthStore.getState()

    if (!auth.user || !auth.accessToken) {
      // Avoid redirect loops: never echo an auth-only path (sign-in / sign-up
      // / otp) back as the redirect target, since doing so causes the
      // bootstrap to bounce to /sign-in again and re-encode this URL.
      const authOnlyPaths = ['/sign-in', '/sign-up', '/otp']
      const target = authOnlyPaths.some((p) =>
        location.pathname.startsWith(p)
      )
        ? '/'
        : `${location.pathname}${location.search}${location.hash}`
      throw redirect({
        to: '/sign-in',
        search: { redirect: target },
      })
    }
  },
  component: AuthenticatedLayout,
})

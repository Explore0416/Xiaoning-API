import { createFileRoute } from '@tanstack/react-router'

import { ModelMonitoring } from '@/features/channels/model-monitoring'

export const Route = createFileRoute('/_authenticated/model-monitoring')({
  component: ModelMonitoring,
})

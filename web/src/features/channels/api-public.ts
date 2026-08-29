import { api } from '@/lib/api'

import type { ChannelsMatrixResponse } from './types'

export async function getPublicChannelsModelsMatrix(): Promise<ChannelsMatrixResponse> {
  const res = await api.get<ChannelsMatrixResponse>(
    '/api/channels/models-matrix'
  )
  return res.data
}

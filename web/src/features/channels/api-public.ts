import { api } from '@/lib/api'

export async function getPublicChannelsModelsMatrix() {
  const res = await api.get('/api/channels/models-matrix')
  return res.data
}
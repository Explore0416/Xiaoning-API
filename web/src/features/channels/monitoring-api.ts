import { api } from '@/lib/api'

export type ModelChannelMonitoring = {
  model: string
  channel_id: number
  channel_name: string
  channel_type: number
  channel_status: number
  response_time: number
  test_time: number
  request_count: number
  success_count: number
  availability: number
  average_latency: number
  recent: boolean[]
}

export type ModelChannelMonitoringResponse = {
  success: boolean
  message?: string
  data?: ModelChannelMonitoring[]
}

export async function getModelChannelMonitoring(days: 7 | 15 | 30) {
  const res = await api.get<ModelChannelMonitoringResponse>(
    '/api/channel/model-monitoring',
    { params: { days } }
  )
  return res.data
}

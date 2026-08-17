import { api } from '@/lib/api'

export type ChannelMonitoringModel = {
  model_name: string
  request_count: number
  success_count: number
  availability: number
  average_latency: number
}

export type ChannelMonitoringItem = {
  channel_id: number
  channel_name: string
  channel_type: number
  channel_status: number
  response_time: number
  test_time: number
  model_count: number
  request_count: number
  success_count: number
  availability: number
  average_latency: number
  recent: boolean[]
  models: ChannelMonitoringModel[]
}

export type ModelMonitoringResponse = {
  success: boolean
  message?: string
  data?: ChannelMonitoringItem[]
}

export async function getModelMonitoring(days: 7 | 15 | 30) {
  const res = await api.get<ModelMonitoringResponse>(
    '/api/channel/model-monitoring',
    { params: { days } }
  )
  return res.data
}

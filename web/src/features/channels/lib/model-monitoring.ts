import type { ModelChannelMonitoring } from '../monitoring-api'

export type MonitoringSummary = {
  total: number
  requests: number
  availability: number
  latency: number
}

export function calculateMonitoringSummary(
  items: ModelChannelMonitoring[]
): MonitoringSummary {
  const requestCount = items.reduce(
    (total, item) => total + item.request_count,
    0
  )
  const successCount = items.reduce(
    (total, item) => total + item.success_count,
    0
  )
  const latencyTotal = items.reduce(
    (total, item) => total + item.average_latency * item.request_count,
    0
  )

  return {
    total: items.length,
    requests: requestCount,
    availability: requestCount > 0 ? (successCount * 100) / requestCount : 0,
    latency: requestCount > 0 ? latencyTotal / requestCount : 0,
  }
}

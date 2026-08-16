import type { ModelMonitoringItem } from '../monitoring-api'

export type ModelHealth = 'operational' | 'degraded' | 'unavailable' | 'unknown'

export type MonitoringSummary = {
  total: number
  requests: number
  availability: number
  latency: number
}

const healthPriority: Record<ModelHealth, number> = {
  unavailable: 0,
  degraded: 1,
  unknown: 2,
  operational: 3,
}

export function getModelHealth(item: ModelMonitoringItem): ModelHealth {
  if (item.available_channel_count === 0) return 'unavailable'
  if (item.request_count === 0) return 'unknown'
  if (item.availability < 90) return 'unavailable'
  if (
    item.availability < 99 ||
    item.available_channel_count < item.channel_count
  ) {
    return 'degraded'
  }
  return 'operational'
}

export function sortMonitoringItems(
  items: ModelMonitoringItem[]
): ModelMonitoringItem[] {
  return [...items].sort((left, right) => {
    const healthDifference =
      healthPriority[getModelHealth(left)] -
      healthPriority[getModelHealth(right)]
    if (healthDifference !== 0) return healthDifference
    return left.model.localeCompare(right.model)
  })
}

export function calculateMonitoringSummary(
  items: ModelMonitoringItem[]
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

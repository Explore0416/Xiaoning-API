import { CHANNEL_STATUS } from '../constants'
import type { ChannelMonitoringItem } from '../monitoring-api'

export type ChannelHealth =
  | 'operational'
  | 'degraded'
  | 'unavailable'
  | 'unknown'

export type MonitoringSummary = {
  total: number
  requests: number
  availability: number
  latency: number
}

const healthPriority: Record<ChannelHealth, number> = {
  unavailable: 0,
  degraded: 1,
  unknown: 2,
  operational: 3,
}

export function getChannelHealth(item: ChannelMonitoringItem): ChannelHealth {
  if (item.channel_status !== CHANNEL_STATUS.ENABLED) return 'unavailable'
  if (item.request_count === 0) return 'unknown'
  if (item.availability < 90) return 'unavailable'
  if (item.availability < 99) return 'degraded'
  return 'operational'
}

export function sortChannels(
  items: ChannelMonitoringItem[]
): ChannelMonitoringItem[] {
  return [...items].sort((left, right) => {
    const healthDifference =
      healthPriority[getChannelHealth(left)] -
      healthPriority[getChannelHealth(right)]
    if (healthDifference !== 0) return healthDifference
    return left.channel_name.localeCompare(right.channel_name)
  })
}

export function calculateChannelSummary(
  items: ChannelMonitoringItem[]
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

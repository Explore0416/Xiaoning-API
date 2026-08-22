import { describe, expect, test } from 'vitest'

import type { ChannelMonitoringItem } from '../../monitoring-api'
import {
  calculateChannelSummary,
  getChannelHealth,
  sortChannels,
} from '../model-monitoring'

function item(
  channelName: string,
  overrides: Partial<ChannelMonitoringItem> = {}
): ChannelMonitoringItem {
  return {
    channel_id: 1,
    channel_name: channelName,
    channel_type: 1,
    channel_status: 1,
    response_time: 20,
    test_time: 0,
    model_count: 1,
    request_count: 1,
    success_count: 1,
    availability: 100,
    average_latency: 20,
    recent: [true],
    models: [],
    ...overrides,
  }
}

describe('channel monitoring aggregation', () => {
  test('weights availability and latency by request count', () => {
    expect(
      calculateChannelSummary([
        item('Fast channel'),
        item('Busy channel', {
          channel_id: 2,
          request_count: 3,
          success_count: 2,
          availability: 66.67,
          average_latency: 80,
          recent: [true, true, false],
        }),
      ])
    ).toEqual({ total: 2, requests: 4, availability: 75, latency: 65 })
  })

  test('derives unknown health when an enabled channel has no request history', () => {
    expect(
      getChannelHealth(
        item('Unobserved channel', {
          request_count: 0,
          success_count: 0,
          availability: 0,
          average_latency: 0,
          recent: [],
        })
      )
    ).toBe('unknown')
  })

  test('marks a disabled channel unavailable before considering history', () => {
    expect(
      getChannelHealth(
        item('Disabled channel', {
          channel_status: 2,
          request_count: 100,
          success_count: 100,
        })
      )
    ).toBe('unavailable')
  })

  test('derives unavailable and degraded health from request availability', () => {
    expect(
      getChannelHealth(
        item('Unavailable channel', {
          availability: 89,
          success_count: 89,
          request_count: 100,
        })
      )
    ).toBe('unavailable')
    expect(
      getChannelHealth(
        item('Degraded channel', {
          availability: 95,
          success_count: 95,
          request_count: 100,
        })
      )
    ).toBe('degraded')
    expect(getChannelHealth(item('Operational channel'))).toBe('operational')
  })

  test('sorts channels by health and then channel name', () => {
    const sorted = sortChannels([
      item('Operational'),
      item('Unknown', {
        channel_id: 2,
        request_count: 0,
        success_count: 0,
        availability: 0,
        recent: [],
      }),
      item('Unavailable', { channel_id: 3, channel_status: 2 }),
      item('Zulu degraded', {
        channel_id: 4,
        availability: 95,
      }),
      item('Alpha degraded', {
        channel_id: 5,
        availability: 95,
      }),
    ])

    expect(sorted.map((channel) => channel.channel_name)).toEqual([
      'Unavailable',
      'Alpha degraded',
      'Zulu degraded',
      'Unknown',
      'Operational',
    ])
  })
})

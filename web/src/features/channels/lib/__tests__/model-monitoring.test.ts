import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { ModelMonitoringItem } from '../../monitoring-api'
import {
  calculateMonitoringSummary,
  getModelHealth,
  sortMonitoringItems,
} from '../model-monitoring'

function item(
  model: string,
  overrides: Partial<ModelMonitoringItem> = {}
): ModelMonitoringItem {
  return {
    model,
    channel_count: 1,
    available_channel_count: 1,
    request_count: 1,
    success_count: 1,
    availability: 100,
    average_latency: 20,
    recent: [true],
    channels: [],
    ...overrides,
  }
}

describe('model monitoring aggregation', () => {
  test('weights availability and latency by request count', () => {
    assert.deepEqual(
      calculateMonitoringSummary([
        item('fast-model'),
        item('busy-model', {
          request_count: 3,
          success_count: 2,
          availability: 66.67,
          average_latency: 80,
          recent: [true, true, false],
        }),
      ]),
      { total: 2, requests: 4, availability: 75, latency: 65 }
    )
  })

  test('derives unknown health when inventory has no request history', () => {
    assert.equal(
      getModelHealth(
        item('unobserved-model', {
          request_count: 0,
          success_count: 0,
          availability: 0,
          average_latency: 0,
          recent: [],
        })
      ),
      'unknown'
    )
  })

  test('marks all unavailable channels as unavailable', () => {
    assert.equal(
      getModelHealth(
        item('offline-model', { available_channel_count: 0, request_count: 0 })
      ),
      'unavailable'
    )
  })

  test('marks partial channel availability or low success as degraded', () => {
    assert.equal(
      getModelHealth(
        item('partial-model', { available_channel_count: 1, channel_count: 2 })
      ),
      'degraded'
    )
    assert.equal(
      getModelHealth(
        item('failing-model', {
          availability: 95,
          success_count: 95,
          request_count: 100,
        })
      ),
      'degraded'
    )
  })

  test('sorts unavailable and degraded models before unknown and operational models', () => {
    const sorted = sortMonitoringItems([
      item('operational'),
      item('unknown', {
        request_count: 0,
        success_count: 0,
        availability: 0,
        recent: [],
      }),
      item('unavailable', { available_channel_count: 0 }),
      item('degraded', { availability: 95 }),
    ])

    assert.deepEqual(
      sorted.map((model) => model.model),
      ['unavailable', 'degraded', 'unknown', 'operational']
    )
  })
})

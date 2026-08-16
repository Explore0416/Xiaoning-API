import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { calculateMonitoringSummary } from '../model-monitoring'

describe('model monitoring summary', () => {
  test('weights availability and latency by request count', () => {
    const summary = calculateMonitoringSummary([
      {
        model: 'fast-model',
        channel_id: 1,
        channel_name: 'Primary',
        channel_type: 1,
        channel_status: 1,
        response_time: 100,
        test_time: 0,
        request_count: 1,
        success_count: 1,
        availability: 100,
        average_latency: 20,
        recent: [true],
      },
      {
        model: 'busy-model',
        channel_id: 2,
        channel_name: 'Fallback',
        channel_type: 1,
        channel_status: 1,
        response_time: 200,
        test_time: 0,
        request_count: 3,
        success_count: 2,
        availability: 66.67,
        average_latency: 80,
        recent: [true, true, false],
      },
    ])

    assert.deepEqual(summary, {
      total: 2,
      requests: 4,
      availability: 75,
      latency: 65,
    })
  })

  test('returns zero metrics for an inventory without requests', () => {
    assert.deepEqual(
      calculateMonitoringSummary([
        {
          model: 'unobserved-model',
          channel_id: 1,
          channel_name: 'Primary',
          channel_type: 1,
          channel_status: 1,
          response_time: 0,
          test_time: 0,
          request_count: 0,
          success_count: 0,
          availability: 0,
          average_latency: 0,
          recent: [],
        },
      ]),
      { total: 1, requests: 0, availability: 0, latency: 0 }
    )
  })
})

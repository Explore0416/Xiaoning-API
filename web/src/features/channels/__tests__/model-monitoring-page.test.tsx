/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

import type { ChannelMonitoringItem } from '../monitoring-api'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'customElements',
  'HTMLDivElement',
  'HTMLSpanElement',
  'DocumentFragment',
  'ShadowRoot',
  'CSSStyleSheet',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

// The channel icon set pulls in antd-style, which reads matchMedia on import.
Object.defineProperty(globalThis, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { ModelMonitoring } = await import('../model-monitoring')
const { api } = await import('@/lib/http-client')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

function channel(
  overrides: Partial<ChannelMonitoringItem> = {}
): ChannelMonitoringItem {
  return {
    channel_id: 1,
    channel_name: 'Primary',
    channel_type: 1,
    channel_status: 1,
    response_time: 120,
    test_time: 0,
    model_count: 1,
    request_count: 4,
    success_count: 4,
    availability: 100,
    average_latency: 200,
    recent: [true],
    models: [
      {
        model_name: 'model-a',
        request_count: 4,
        success_count: 4,
        availability: 100,
        average_latency: 200,
      },
    ],
    ...overrides,
  }
}

async function renderMonitoring(items: ChannelMonitoringItem[]) {
  // Stub only the network boundary: the request adapter returns the fixture
  // so the real query, component and formatting code all execute.
  const interceptor = api.interceptors.request.use((config) => ({
    ...config,
    adapter: async () => ({
      data: { success: true, data: items },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }),
  }))

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () =>
    root.render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <ModelMonitoring />
        </QueryClientProvider>
      </I18nextProvider>
    )
  )
  // Wait for the query to resolve into rendered rows instead of guessing at
  // a fixed number of microtask flushes.
  for (let attempt = 0; attempt < 50; attempt++) {
    if (
      queryClient.isFetching() === 0 &&
      container.querySelector('[data-panel-open], [aria-expanded]')
    ) {
      break
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }

  const restore = () => {
    api.interceptors.request.eject(interceptor)
    queryClient.clear()
    container.remove()
  }
  return { container, restore }
}

describe('channel monitoring page', () => {
  after(() => {
    domWindow.close()
  })

  test('renders one collapsed row per channel even when a channel serves many models', async () => {
    const { container, restore } = await renderMonitoring([
      channel({
        channel_id: 7,
        channel_name: 'Multi model channel',
        model_count: 3,
        models: [
          {
            model_name: 'model-a',
            request_count: 2,
            success_count: 2,
            availability: 100,
            average_latency: 100,
          },
          {
            model_name: 'model-b',
            request_count: 1,
            success_count: 1,
            availability: 100,
            average_latency: 100,
          },
          {
            model_name: 'model-c',
            request_count: 1,
            success_count: 1,
            availability: 100,
            average_latency: 100,
          },
        ],
      }),
    ])

    try {
      const triggers = container.querySelectorAll('[data-panel-open]')
      const text = container.textContent ?? ''
      // The channel is the monitored unit, so its name is the row heading.
      assert.equal(text.includes('Multi model channel'), true)
      // Models belong to the collapsed detail, not the top-level row.
      assert.equal(triggers.length <= 1, true)
      assert.equal(text.includes('model-a'), false)
      assert.equal(text.includes('model-b'), false)
      assert.equal(text.includes('model-c'), false)
    } finally {
      restore()
    }
  })

  test('orders request history from oldest to latest so the newest result is last', async () => {
    // Backend returns newest-first; the bar must read left-to-right as oldest-to-newest.
    const { container, restore } = await renderMonitoring([
      channel({ recent: [false, true, true] }),
    ])

    try {
      const historyBar = container.querySelector<HTMLElement>('[aria-label]')
      assert.ok(historyBar)
      const segments = [...historyBar.children]
      assert.equal(segments.length, 3)
      const failureIndex = segments.findIndex((segment) =>
        segment.className.includes('bg-destructive')
      )
      // The newest entry (a failure) must render last.
      assert.equal(failureIndex, segments.length - 1)
    } finally {
      restore()
    }
  })

  test('shows an em dash instead of a healthy figure when a channel has no requests', async () => {
    const { container, restore } = await renderMonitoring([
      channel({
        request_count: 0,
        success_count: 0,
        availability: 0,
        average_latency: 0,
        recent: [],
      }),
    ])

    try {
      const text = container.textContent ?? ''
      assert.equal(text.includes('—'), true)
      assert.equal(text.includes('0.00%'), false)
    } finally {
      restore()
    }
  })
})

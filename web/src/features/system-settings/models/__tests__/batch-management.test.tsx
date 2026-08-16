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

import { AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios'
import { Window } from 'happy-dom'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
})

Object.defineProperty(domWindow, 'matchMedia', {
  configurable: true,
  value: () => ({
    matches: false,
    media: '',
    addEventListener() {},
    removeEventListener() {},
  }),
})

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { api } = await import('@/lib/api')
const { PricingModelBatchManager } =
  await import('../pricing-model-batch-manager')
const { RatioBatchAdjustDialog } =
  await import('../dialogs/ratio-batch-adjust-dialog')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

async function render(ui: React.ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const queryClient = createQueryClient()

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
      </QueryClientProvider>
    )
  })

  return {
    container,
    queryClient,
    async cleanup() {
      await act(async () => root.unmount())
      container.remove()
      queryClient.clear()
    },
  }
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    if (check()) return
  }
  assert.fail('Condition was not met')
}

function findButton(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text
  )
  assert.ok(button instanceof HTMLButtonElement)
  return button
}

function click(element: Element) {
  element.dispatchEvent(
    new domWindow.MouseEvent('click', { bubbles: true }) as unknown as Event
  )
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    domWindow.HTMLInputElement.prototype,
    'value'
  )?.set
  assert.ok(valueSetter)
  valueSetter.call(input, value)
  input.dispatchEvent(
    new domWindow.Event('input', { bubbles: true }) as unknown as Event
  )
}

describe('pricing model batch management', () => {
  after(() => {
    domWindow.close()
  })

  test('shows loading and empty inventory states', async () => {
    let resolveRequest: ((value: AxiosResponse) => void) | undefined
    api.defaults.adapter = (() =>
      new Promise((resolve) => {
        resolveRequest = resolve
      })) as AxiosAdapter

    const view = await render(<PricingModelBatchManager />)
    assert.match(view.container.textContent ?? '', /Loading model inventory/)

    await act(async () => {
      resolveRequest?.({
        data: { success: true, data: [] },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: { headers: new AxiosHeaders() },
      })
    })
    await waitFor(() =>
      (view.container.textContent ?? '').includes('No models found')
    )

    await view.cleanup()
  })

  test('shows an inventory request failure', async () => {
    api.defaults.adapter = (() =>
      Promise.reject(new Error('inventory unavailable'))) as AxiosAdapter

    const view = await render(<PricingModelBatchManager />)
    await waitFor(() =>
      (view.container.textContent ?? '').includes(
        'Failed to load model inventory'
      )
    )

    await view.cleanup()
  })

  test('renders malformed inventory entries without throwing', async () => {
    api.defaults.adapter = (async () => ({
      data: {
        success: true,
        data: [
          null,
          { model_name: 42 },
          {
            model_name: 'gpt-test',
            sources: 'ability',
            pricing: null,
            channels: [{ name: 'valid', type: 1 }, { name: 7 }],
          },
        ],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: { headers: new AxiosHeaders() },
    })) as AxiosAdapter

    const view = await render(<PricingModelBatchManager />)
    await waitFor(() =>
      (view.container.textContent ?? '').includes('gpt-test')
    )
    assert.doesNotMatch(view.container.textContent ?? '', /General Error/)
    assert.match(view.container.textContent ?? '', /valid/)
    assert.doesNotMatch(view.container.textContent ?? '', /undefined/)

    await view.cleanup()
  })

  test('requires a fresh preview with changes before applying', async () => {
    let previewCount = 0
    api.defaults.adapter = (async (config) => {
      assert.equal(config.url, '/api/ratio_batch/preview')
      previewCount += 1
      return {
        data: {
          success: true,
          data: {
            changes:
              previewCount === 1
                ? []
                : [
                    {
                      field: 'model_ratio',
                      model: 'gpt-test',
                      old: 1,
                      new: 2,
                    },
                  ],
            errors: [],
            skipped: [],
            affected_count: previewCount === 1 ? 0 : 1,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }) as AxiosAdapter

    const view = await render(
      <RatioBatchAdjustDialog open onOpenChange={() => undefined} />
    )
    const applyButton = findButton('Apply')
    assert.equal(applyButton.disabled, true)

    await act(async () => click(findButton('Preview')))
    await waitFor(() => previewCount === 1)
    assert.equal(applyButton.disabled, true)

    const patternInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Model match pattern"]'
    )
    assert.ok(patternInput)
    await act(async () => changeInputValue(patternInput, 'gpt-'))
    await act(async () => click(findButton('Preview')))
    await waitFor(() => previewCount === 2 && !applyButton.disabled)
    assert.equal(applyButton.disabled, false)

    await act(async () => changeInputValue(patternInput, 'claude-'))
    assert.equal(applyButton.disabled, true)

    await view.cleanup()
  })
})

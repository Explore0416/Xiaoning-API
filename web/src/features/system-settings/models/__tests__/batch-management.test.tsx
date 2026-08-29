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
import { describe, expect, test } from 'vitest'

import { AxiosHeaders, type AxiosAdapter, type AxiosResponse } from 'axios'

import { api } from '@/lib/api'
import { PricingModelBatchManager } from '../pricing-model-batch-manager'
import { RatioBatchAdjustDialog } from '../dialogs/ratio-batch-adjust-dialog'

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')

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
  throw new Error('Condition was not met')
}

function findButton(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === text
  )
  expect(button).toBeInstanceOf(HTMLButtonElement)
  return button as HTMLButtonElement
}

function click(element: Element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set
  expect(valueSetter).toBeTruthy()
  valueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('pricing model batch management', () => {
  test('shows loading and empty inventory states', async () => {
    let resolveRequest: ((value: AxiosResponse) => void) | undefined
    api.defaults.adapter = (() =>
      new Promise((resolve) => {
        resolveRequest = resolve
      })) as AxiosAdapter

    const view = await render(<PricingModelBatchManager />)
    expect(view.container.textContent ?? '').toMatch(/Loading model inventory/)

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
    expect(view.container.textContent ?? '').not.toMatch(/General Error/)
    expect(view.container.textContent ?? '').toMatch(/valid/)
    expect(view.container.textContent ?? '').not.toMatch(/undefined/)

    await view.cleanup()
  })

  test('requires a fresh preview with changes before applying', async () => {
    let previewCount = 0
    api.defaults.adapter = (async (config) => {
      expect(config.url).toBe('/api/ratio_batch/preview')
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
    expect(applyButton.disabled).toBe(true)

    await act(async () => click(findButton('Preview')))
    await waitFor(() => previewCount === 1)
    expect(applyButton.disabled).toBe(true)

    const patternInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Model match pattern"]'
    )
    expect(patternInput).toBeTruthy()
    await act(async () => changeInputValue(patternInput!, 'gpt-'))
    await act(async () => click(findButton('Preview')))
    await waitFor(() => previewCount === 2 && !applyButton.disabled)
    expect(applyButton.disabled).toBe(false)

    await act(async () => changeInputValue(patternInput!, 'claude-'))
    expect(applyButton.disabled).toBe(true)

    await view.cleanup()
  })
})

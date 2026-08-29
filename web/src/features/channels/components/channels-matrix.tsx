/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'

import { getPublicChannelsModelsMatrix } from '../api-public'

type MatrixStatusFilter = 'all' | 'enabled' | 'disabled'

export function ChannelsMatrix() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<MatrixStatusFilter>('all')

  const matrixQuery = useQuery({
    queryKey: ['channel-models-matrix'],
    queryFn: getPublicChannelsModelsMatrix,
  })
  const channels = matrixQuery.data?.data ?? []

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return channels.filter((channel) => {
      if (statusFilter === 'enabled' && channel.status !== 1) return false
      if (statusFilter === 'disabled' && channel.status === 1) return false
      if (!keyword) return true
      return (
        channel.name.toLowerCase().includes(keyword) ||
        channel.models.some((model) => model.model.toLowerCase().includes(keyword))
      )
    })
  }, [channels, query, statusFilter])

  const allModelNames = useMemo(() => {
    const set = new Set<string>()
    for (const channel of channels) {
      for (const model of channel.models) set.add(model.model)
    }
    return Array.from(set).sort()
  }, [channels])

  const summary = useMemo(() => {
    const enabled = channels.filter((channel) => channel.status === 1)
    const totalCapabilities = channels.reduce(
      (sum, channel) => sum + channel.models.length,
      0
    )
    return { totalChannels: channels.length, enabledChannels: enabled.length, totalCapabilities }
  }, [channels])

  const { totalChannels, enabledChannels, totalCapabilities } = summary

  return (
    <div className='flex h-full min-h-0 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='h-9 w-56'
          placeholder={t('Search channels or models')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className='h-9 rounded-md border bg-background px-2 text-sm'
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as MatrixStatusFilter)}
        >
          <option value='all'>{t('All statuses')}</option>
          <option value='enabled'>{t('Enabled')}</option>
          <option value='disabled'>{t('Disabled')}</option>
        </select>
        <p className='text-muted-foreground ml-auto text-sm'>
          {t('{{total}} channels, {{enabled}} enabled, {{capabilities}} model capabilities', {
            total: totalChannels,
            enabled: enabledChannels,
            capabilities: totalCapabilities,
          })}
        </p>
      </div>

      <div className='min-h-0 flex-1 overflow-auto rounded-md border'>
        <table className='w-full text-sm'>
          <thead className='sticky top-0 bg-background text-left'>
            <tr>
              <th className='p-3'>{t('Channel')}</th>
              {allModelNames.map((model) => (
                <th key={model} className='p-2 text-center font-mono text-xs'>
                  {model}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((channel) => (
              <tr key={channel.id} className='border-t'>
                <td className='p-3'>
                  <div className='flex items-center gap-2'>
                    <span className='font-medium'>{channel.name}</span>
                    <span className='text-muted-foreground text-xs'>
                      #{channel.type}
                    </span>
                  </div>
                </td>
                {allModelNames.map((model) => {
                  const entry = channel.models.find((m) => m.model === model)
                  return (
                    <td key={model} className='p-1 text-center'>
                      {entry ? (
                        <div className='inline-flex flex-col items-center'>
                          {entry.enabled ? (
                            <span className='bg-primary/15 text-primary rounded px-1 py-0.5 text-[10px] font-medium'>
                              ✓
                            </span>
                          ) : (
                            <span className='bg-muted rounded px-1 py-0.5 text-[10px] text-muted-foreground'>
                              ✗
                            </span>
                          )}
                          {entry.weight > 0 && (
                            <span className='text-muted-foreground text-[9px]'>
                              w{entry.weight}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className='text-muted-foreground text-xs'>-</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className='p-6 text-center text-muted-foreground' colSpan={allModelNames.length + 1}>
                  {t('No channels match the current filters')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
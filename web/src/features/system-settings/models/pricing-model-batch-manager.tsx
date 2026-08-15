/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import {
  batchCreatePricingModels,
  batchDeletePricingModels,
  batchUpdatePricingModels,
  getPricingModelInventory,
  type PricingModelInventoryItem,
} from '../api'
import { RatioBatchAdjustDialog } from './dialogs/ratio-batch-adjust-dialog'

type InventoryFilter = 'all' | 'ability' | 'priced' | 'missing-metadata'

function pricingSummary(item: PricingModelInventoryItem): string {
  if (item.pricing.model_price !== undefined) {
    return `fixed: ${item.pricing.model_price}`
  }
  const values = [
    ['in', item.pricing.model_ratio],
    ['out', item.pricing.completion_ratio],
    ['cache', item.pricing.cache_ratio],
  ].filter(([, value]) => value !== undefined)
  return values.length > 0
    ? values.map(([name, value]) => `${name}: ${value}`).join(' | ')
    : '-'
}

export function PricingModelBatchManager() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<InventoryFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [metadataDialog, setMetadataDialog] = useState<'create' | 'update' | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [priceDialogOpen, setPriceDialogOpen] = useState(false)
  const [tags, setTags] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState(1)
  const [syncOfficial, setSyncOfficial] = useState(1)
  const [applyTags, setApplyTags] = useState(false)
  const [applyDescription, setApplyDescription] = useState(false)
  const [applyStatus, setApplyStatus] = useState(false)
  const [applySyncOfficial, setApplySyncOfficial] = useState(false)

  const inventoryQuery = useQuery({
    queryKey: ['pricing-model-inventory'],
    queryFn: getPricingModelInventory,
  })
  const inventory = inventoryQuery.data?.data ?? []
  const selected = useMemo(
    () => inventory.filter((item) => selectedNames.includes(item.model_name)),
    [inventory, selectedNames]
  )
  const selectedMetadata = selected.filter((item) => item.metadata)
  const selectedWithoutMetadata = selected.filter((item) => !item.metadata)

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return inventory.filter((item) => {
      if (filter === 'ability' && !item.sources.includes('ability')) return false
      if (filter === 'priced' && item.sources.length === 1 && item.sources[0] === 'ability') return false
      if (filter === 'missing-metadata' && item.metadata) return false
      return !keyword || item.model_name.toLowerCase().includes(keyword)
    })
  }, [filter, inventory, query])

  const invalidateInventory = () => {
    queryClient.invalidateQueries({ queryKey: ['pricing-model-inventory'] })
    queryClient.invalidateQueries({ queryKey: ['system-options'] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      batchCreatePricingModels(
        selectedWithoutMetadata.map((item) => ({
          model_name: item.model_name,
          description,
          tags,
          status,
          sync_official: syncOfficial,
        }))
      ),
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to create model metadata'))
        return
      }
      toast.success(t('Created metadata for {{count}} model(s)', { count: selectedWithoutMetadata.length }))
      setMetadataDialog(null)
      invalidateInventory()
    },
    onError: (error: Error) => toast.error(error.message || t('Failed to create model metadata')),
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      batchUpdatePricingModels(
        selectedMetadata.map((item) => item.metadata?.id ?? 0),
        (() => {
          const patch: Record<string, unknown> = {}
          if (applyTags) patch.tags = tags
          if (applyDescription) patch.description = description
          if (applyStatus) patch.status = status
          if (applySyncOfficial) patch.sync_official = syncOfficial
          return patch
        })()
      ),
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to update model metadata'))
        return
      }
      toast.success(t('Updated metadata for {{count}} model(s)', { count: selectedMetadata.length }))
      setMetadataDialog(null)
      invalidateInventory()
    },
    onError: (error: Error) => toast.error(error.message || t('Failed to update model metadata')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => batchDeletePricingModels(selectedMetadata.map((item) => item.metadata?.id ?? 0)),
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to delete model metadata'))
        return
      }
      toast.success(t('Deleted metadata for {{count}} model(s)', { count: selectedMetadata.length }))
      setDeleteOpen(false)
      setSelectedNames([])
      invalidateInventory()
    },
    onError: (error: Error) => toast.error(error.message || t('Failed to delete model metadata')),
  })

  const toggleSelection = (name: string) => {
    setSelectedNames((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    )
  }

  const openMetadataDialog = (mode: 'create' | 'update') => {
    setTags(mode === 'update' && selectedMetadata.length === 1 ? selectedMetadata[0].metadata?.tags ?? '' : '')
    setDescription(mode === 'update' && selectedMetadata.length === 1 ? selectedMetadata[0].metadata?.description ?? '' : '')
    setStatus(mode === 'update' && selectedMetadata.length === 1 ? selectedMetadata[0].metadata?.status ?? 1 : 1)
    setSyncOfficial(mode === 'update' && selectedMetadata.length === 1 ? selectedMetadata[0].metadata?.sync_official ?? 1 : 1)
    setApplyTags(mode === 'create')
    setApplyDescription(mode === 'create')
    setApplyStatus(mode === 'create')
    setApplySyncOfficial(mode === 'create')
    setMetadataDialog(mode)
  }

  return (
    <div className='flex min-h-0 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <input
          className='h-9 w-56 rounded-md border bg-background px-3 text-sm'
          placeholder={t('Search models')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className='h-9 rounded-md border bg-background px-2 text-sm'
          value={filter}
          onChange={(event) => setFilter(event.target.value as InventoryFilter)}
        >
          <option value='all'>{t('All models')}</option>
          <option value='ability'>{t('Channel models')}</option>
          <option value='priced'>{t('Models with explicit pricing')}</option>
          <option value='missing-metadata'>{t('Missing metadata')}</option>
        </select>
        <Button variant='outline' size='sm' onClick={() => inventoryQuery.refetch()}>
          <RefreshCw className='mr-2 h-4 w-4' />
          {t('Refresh')}
        </Button>
        <div className='ml-auto flex flex-wrap gap-2'>
          <Button size='sm' variant='outline' disabled={!selectedWithoutMetadata.length} onClick={() => openMetadataDialog('create')}>
            <Plus className='mr-2 h-4 w-4' />
            {t('Create metadata')}
          </Button>
          <Button size='sm' variant='outline' disabled={!selectedMetadata.length} onClick={() => openMetadataDialog('update')}>
            <Pencil className='mr-2 h-4 w-4' />
            {t('Edit metadata')}
          </Button>
          <Button size='sm' variant='outline' disabled={!selected.length} onClick={() => setPriceDialogOpen(true)}>
            <Tags className='mr-2 h-4 w-4' />
            {t('Adjust selected prices')}
          </Button>
          <Button size='sm' variant='destructive' disabled={!selectedMetadata.length} onClick={() => setDeleteOpen(true)}>
            <Trash2 className='mr-2 h-4 w-4' />
            {t('Delete metadata')}
          </Button>
        </div>
      </div>

      <p className='text-muted-foreground text-sm'>
        {t('This list combines enabled channel models with every explicitly configured pricing entry. Deleting metadata does not disable a channel model.')}
      </p>

      <div className='overflow-x-auto rounded-md border'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/50 text-left'>
            <tr>
              <th className='w-10 p-3'>
                <input
                  type='checkbox'
                  checked={filtered.length > 0 && filtered.every((item) => selectedNames.includes(item.model_name))}
                  onChange={(event) => setSelectedNames(event.target.checked ? filtered.map((item) => item.model_name) : [])}
                />
              </th>
              <th className='p-3'>{t('Model')}</th>
              <th className='p-3'>{t('Sources')}</th>
              <th className='p-3'>{t('Pricing')}</th>
              <th className='p-3'>{t('Channels')}</th>
              <th className='p-3'>{t('Metadata')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.model_name} className='border-t'>
                <td className='p-3'>
                  <input type='checkbox' checked={selectedNames.includes(item.model_name)} onChange={() => toggleSelection(item.model_name)} />
                </td>
                <td className='p-3 font-mono text-xs'>{item.model_name}</td>
                <td className='p-3 text-xs'>{item.sources.join(', ')}</td>
                <td className='p-3 font-mono text-xs'>{pricingSummary(item)}</td>
                <td className='p-3 text-xs'>{item.channels.map((channel) => channel.name).join(', ') || '-'}</td>
                <td className='p-3 text-xs'>{item.metadata ? (item.metadata.tags || t('Configured')) : t('Missing metadata')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog
        open={metadataDialog !== null}
        onOpenChange={(open) => !open && setMetadataDialog(null)}
        title={t(metadataDialog === 'create' ? 'Create model metadata' : 'Edit model metadata')}
        description={t('Apply the following metadata to {{count}} selected model(s).', { count: metadataDialog === 'create' ? selectedWithoutMetadata.length : selectedMetadata.length })}
        footer={<>
          <Button variant='outline' onClick={() => setMetadataDialog(null)}>{t('Cancel')}</Button>
          <Button onClick={() => metadataDialog === 'create' ? createMutation.mutate() : updateMutation.mutate()} disabled={createMutation.isPending || updateMutation.isPending}>
            {t('Apply')}
          </Button>
        </>}
      >
        <div className='grid gap-3'>
          {metadataDialog === 'update' && (
            <p className='text-muted-foreground text-xs'>{t('Select the fields to apply. Unselected fields are preserved.')}</p>
          )}
          <label className='flex items-center gap-2 text-sm'>
            {metadataDialog === 'update' && <input type='checkbox' checked={applyTags} onChange={(event) => setApplyTags(event.target.checked)} />}
            <input className='h-9 flex-1 rounded-md border bg-background px-3 text-sm' placeholder={t('Tags')} value={tags} onChange={(event) => setTags(event.target.value)} />
          </label>
          <label className='flex items-start gap-2 text-sm'>
            {metadataDialog === 'update' && <input className='mt-2' type='checkbox' checked={applyDescription} onChange={(event) => setApplyDescription(event.target.checked)} />}
            <textarea className='min-h-24 flex-1 rounded-md border bg-background p-3 text-sm' placeholder={t('Description')} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className='flex items-center gap-2 text-sm'>
            {metadataDialog === 'update' && <input type='checkbox' checked={applyStatus} onChange={(event) => setApplyStatus(event.target.checked)} />}
            <input type='checkbox' checked={status === 1} onChange={(event) => setStatus(event.target.checked ? 1 : 0)} />{t('Enabled')}
          </label>
          <label className='flex items-center gap-2 text-sm'>
            {metadataDialog === 'update' && <input type='checkbox' checked={applySyncOfficial} onChange={(event) => setApplySyncOfficial(event.target.checked)} />}
            <input type='checkbox' checked={syncOfficial === 1} onChange={(event) => setSyncOfficial(event.target.checked ? 1 : 0)} />{t('Sync official metadata')}
          </label>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('Delete metadata?')}
        description={t('This deletes metadata only. Selected models will remain available while they are enabled in channel configuration.')}
        footer={<>
          <Button variant='outline' onClick={() => setDeleteOpen(false)}>{t('Cancel')}</Button>
          <Button variant='destructive' onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>{t('Delete')}</Button>
        </>}
      >
        <p className='text-sm'>{selectedMetadata.map((item) => item.model_name).join(', ')}</p>
      </Dialog>

      <RatioBatchAdjustDialog
        open={priceDialogOpen}
        onOpenChange={setPriceDialogOpen}
        targetModels={selected.map((item) => item.model_name)}
        onApplied={invalidateInventory}
      />
    </div>
  )
}

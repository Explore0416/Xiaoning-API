/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import {
  applyRatioBatch,
  previewRatioBatch,
  type RatioBatchRule,
} from '../../api'

const fieldOptions: Array<{ value: RatioBatchRule['field']; label: string }> = [
  { value: 'model_ratio', label: 'Model ratio' },
  { value: 'completion_ratio', label: 'Completion ratio' },
  { value: 'cache_ratio', label: 'Cache ratio' },
  { value: 'create_cache_ratio', label: 'Create cache ratio' },
  { value: 'image_ratio', label: 'Image ratio' },
  { value: 'audio_ratio', label: 'Audio ratio' },
  { value: 'audio_completion_ratio', label: 'Audio completion ratio' },
  { value: 'model_price', label: 'Fixed price' },
]

const defaultRule = (): RatioBatchRule => ({
  field: 'model_ratio',
  match: { type: 'prefix', pattern: '' },
  op: { type: 'multiply', value: 1 },
})

type RatioBatchAdjustDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetModels?: string[]
  onApplied?: () => void
}

export function RatioBatchAdjustDialog({
  open,
  onOpenChange,
  targetModels,
  onApplied,
}: RatioBatchAdjustDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [rules, setRules] = useState<RatioBatchRule[]>([defaultRule()])
  const [preview, setPreview] = useState<{
    changes: Array<{ field: string; model: string; old: number; new: number }>
    errors: Array<{ field?: string; model?: string; message: string }>
  } | null>(null)

  const previewMutation = useMutation({
    mutationFn: () => previewRatioBatch(rules, targetModels),
    onSuccess: (response) => {
      const data = response.data
      setPreview({ changes: data?.changes ?? [], errors: data?.errors ?? [] })
      if (!response.success) {
        toast.error(response.message || t('Failed to preview batch adjustment'))
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to preview batch adjustment'))
    },
  })

  const applyMutation = useMutation({
    mutationFn: () => applyRatioBatch(rules, targetModels),
    onSuccess: (response) => {
      const data = response.data
      setPreview({ changes: data?.changes ?? [], errors: data?.errors ?? [] })
      if (!response.success) {
        toast.error(response.message || t('Failed to apply batch adjustment'))
        return
      }
      toast.success(
        t('Updated {{count}} model price value(s)', {
          count: data?.affected_count ?? 0,
        })
      )
      queryClient.invalidateQueries({ queryKey: ['system-options'] })
      queryClient.invalidateQueries({ queryKey: ['pricing-model-inventory'] })
      onApplied?.()
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to apply batch adjustment'))
    },
  })

  const updateRule = (index: number, next: Partial<RatioBatchRule>) => {
    setPreview(null)
    setRules((current) =>
      current.map((rule, currentIndex) =>
        currentIndex === index ? { ...rule, ...next } : rule
      )
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Batch Adjust Prices')}
      description={t(
        'Preview changes before applying. Later rules are applied after earlier rules.'
      )}
      contentHeight='32rem'
      footer={
        <>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            variant='outline'
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending || applyMutation.isPending}
          >
            {previewMutation.isPending ? t('Previewing...') : t('Preview')}
          </Button>
          <Button
            onClick={() => applyMutation.mutate()}
            disabled={
              applyMutation.isPending ||
              previewMutation.isPending ||
              !preview ||
              preview.errors.length > 0
            }
          >
            {applyMutation.isPending ? t('Applying...') : t('Apply')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        {rules.map((rule, index) => (
          <div
            key={index}
            className='grid gap-2 rounded-md border p-3 md:grid-cols-[1fr_0.8fr_1fr_0.8fr_7rem_auto]'
          >
            <select
              className='h-9 rounded-md border bg-background px-2 text-sm'
              value={rule.field}
              onChange={(event) =>
                updateRule(index, {
                  field: event.target.value as RatioBatchRule['field'],
                })
              }
            >
              {fieldOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
            <select
              className='h-9 rounded-md border bg-background px-2 text-sm'
              value={rule.match.type}
              onChange={(event) =>
                updateRule(index, {
                  match: {
                    ...rule.match,
                    type: event.target.value as RatioBatchRule['match']['type'],
                  },
                })
              }
            >
              {['prefix', 'suffix', 'contains', 'exact', 'regex'].map((type) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </select>
            <input
              className='h-9 rounded-md border bg-background px-2 text-sm'
              value={rule.match.pattern}
              onChange={(event) =>
                updateRule(index, {
                  match: { ...rule.match, pattern: event.target.value },
                })
              }
              placeholder={t('Model match pattern')}
            />
            <select
              className='h-9 rounded-md border bg-background px-2 text-sm'
              value={rule.op.type}
              onChange={(event) =>
                updateRule(index, {
                  op: {
                    ...rule.op,
                    type: event.target.value as RatioBatchRule['op']['type'],
                  },
                })
              }
            >
              {['multiply', 'set', 'add'].map((type) => (
                <option key={type} value={type}>
                  {t(type)}
                </option>
              ))}
            </select>
            <input
              className='h-9 rounded-md border bg-background px-2 text-sm'
              type='number'
              min='0'
              step='any'
              value={rule.op.value}
              onChange={(event) =>
                updateRule(index, {
                  op: { ...rule.op, value: Number(event.target.value) },
                })
              }
            />
            <Button
              variant='ghost'
              size='icon'
              disabled={rules.length === 1}
              onClick={() => {
                setPreview(null)
                setRules((current) => current.filter((_, i) => i !== index))
              }}
              aria-label={t('Remove rule')}
            >
              <Trash2 className='h-4 w-4' />
            </Button>
          </div>
        ))}
        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setPreview(null)
            setRules((current) => [...current, defaultRule()])
          }}
        >
          <Plus className='mr-2 h-4 w-4' />
          {t('Add rule')}
        </Button>

        {preview && (
          <div className='space-y-2 rounded-md border p-3 text-sm'>
            <p className='font-medium'>
              {t('{{count}} model price value(s) will change', {
                count: preview.changes.length,
              })}
            </p>
            {preview.errors.map((error, index) => (
              <p key={`${error.field}-${error.model}-${index}`} className='text-destructive'>
                {error.field} {error.model}: {error.message}
              </p>
            ))}
            <div className='max-h-48 space-y-1 overflow-y-auto font-mono text-xs'>
              {preview.changes.map((change) => (
                <p key={`${change.field}-${change.model}`}>
                  {change.model} / {change.field}: {change.old} -&gt; {change.new}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

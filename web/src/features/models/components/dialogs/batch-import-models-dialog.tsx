/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import { batchCreateModels } from '../../api'
import { modelsQueryKeys } from '../../lib'
import type { Model } from '../../types'

type BatchImportModelsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BatchImportModelsDialog({
  open,
  onOpenChange,
}: BatchImportModelsDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [value, setValue] = useState('')

  const mutation = useMutation({
    mutationFn: (models: Partial<Model>[]) => batchCreateModels(models),
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to import models'))
        return
      }
      const created = response.data?.created.length ?? 0
      const skipped = response.data?.skipped.length ?? 0
      toast.success(
        t('Imported {{created}} model(s), skipped {{skipped}} duplicate(s)', {
          created,
          skipped,
        })
      )
      queryClient.invalidateQueries({ queryKey: modelsQueryKeys.lists() })
      onOpenChange(false)
    },
    onError: (error: Error) => {
      toast.error(error.message || t('Failed to import models'))
    },
  })

  useEffect(() => {
    if (!open) {
      setValue('')
    }
  }, [open])

  const handleImport = () => {
    let models: Partial<Model>[]
    try {
      const parsed: unknown = JSON.parse(value)
      if (!Array.isArray(parsed)) throw new Error('not an array')
      models = parsed as Partial<Model>[]
    } catch {
      toast.error(t('Paste a JSON array of model objects'))
      return
    }
    if (models.length === 0) {
      toast.error(t('At least one model is required'))
      return
    }
    mutation.mutate(models)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Batch Import Models')}
      description={t(
        'Paste a JSON array. Each item requires model_name and can include description, vendor_id, tags, status, sync_official, and name_rule.'
      )}
      contentHeight='20rem'
      footer={
        <>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleImport} disabled={mutation.isPending}>
            {mutation.isPending ? t('Importing...') : t('Import models')}
          </Button>
        </>
      }
    >
      <textarea
        className='min-h-56 w-full resize-y rounded-md border bg-transparent p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-ring'
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={'[\n  { "model_name": "gpt-4o-mini", "status": 1 }\n]'}
      />
    </Dialog>
  )
}

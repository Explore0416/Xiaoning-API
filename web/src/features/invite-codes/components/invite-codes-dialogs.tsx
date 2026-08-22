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
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import { generateInviteCodes, deleteInviteCode, deleteExpiredInviteCodes } from '../api'
import { useInviteCodes } from './invite-codes-provider'

const createSchema = z.object({
  count: z.coerce.number().int().min(1).max(1000),
  quota: z.coerce.number().int().min(0).default(0),
  max_use_count: z.coerce.number().int().min(0).default(1),
  has_expiry: z.boolean().default(false),
  expired_days: z.coerce.number().int().min(1).optional(),
})

export function InviteCodesDialogs() {
  const { t } = useTranslation()
  const { dialog, dialogData, closeDialog, refresh } = useInviteCodes()

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: { count: 10, quota: 0, max_use_count: 1, has_expiry: false, expired_days: 30 },
  })

  const handleCreate = async (data: z.infer<typeof createSchema>) => {
    const expired_time = data.has_expiry && data.expired_days
      ? Math.floor(Date.now() / 1000) + data.expired_days * 86400
      : 0
    const res = await generateInviteCodes({
      count: data.count,
      quota: data.quota,
      max_use_count: data.max_use_count,
      expired_time,
    })
    if (res.success) {
      toast.success(t('Invite codes created successfully'))
      closeDialog()
      refresh()
      createForm.reset()
    } else {
      toast.error(res.message || t('Failed to create invite codes'))
    }
  }

  const handleDelete = async () => {
    if (!dialogData) return
    const res = await deleteInviteCode(dialogData.id)
    if (res.success) {
      toast.success(t('Invite code deleted'))
      closeDialog()
      refresh()
    } else {
      toast.error(res.message || t('Failed to delete invite code'))
    }
  }

  const handleCleanup = async () => {
    const res = await deleteExpiredInviteCodes()
    if (res.success) {
      toast.success(t('Cleaned up expired invite codes'))
      closeDialog()
      refresh()
    } else {
      toast.error(res.message || t('Failed to clean up'))
    }
  }

  return (
    <>
      <Dialog open={dialog === 'create'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Generate Invite Codes')}</DialogTitle>
            <DialogDescription>
              {t('Create batch invite codes for new user registration')}
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(handleCreate)} className='space-y-4'>
              <FormField control={createForm.control} name='count' render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Number of codes')}</FormLabel>
                  <FormControl><Input type='number' min={1} max={1000} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createForm.control} name='quota' render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Bonus quota per code')}</FormLabel>
                  <FormControl><Input type='number' min={0} {...field} /></FormControl>
                  <FormDescription>{t('0 = threshold-only, no quota bonus')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createForm.control} name='max_use_count' render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Max uses per code')}</FormLabel>
                  <FormControl><Input type='number' min={0} {...field} /></FormControl>
                  <FormDescription>{t('0 = unlimited, 1 = single use')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createForm.control} name='has_expiry' render={({ field }) => (
                <FormItem className='flex items-center gap-2'>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  <FormLabel className='!mt-0'>{t('Set expiration')}</FormLabel>
                </FormItem>
              )} />
              {createForm.watch('has_expiry') && (
                <FormField control={createForm.control} name='expired_days' render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expires in (days)')}</FormLabel>
                    <FormControl><Input type='number' min={1} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <DialogFooter>
                <Button type='submit' disabled={createForm.formState.isSubmitting}>
                  {createForm.formState.isSubmitting && <Loader2 className='animate-spin' />}
                  {t('Generate')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete Invite Code')}</DialogTitle>
            <DialogDescription>
              {t('Are you sure you want to delete this invite code?')}
            </DialogDescription>
          </DialogHeader>
          {dialogData && (
            <p className='font-mono text-center text-lg'>{dialogData.code}</p>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={closeDialog}>{t('Cancel')}</Button>
            <Button variant='destructive' onClick={handleDelete}>{t('Delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

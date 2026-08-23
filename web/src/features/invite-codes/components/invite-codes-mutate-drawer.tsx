import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/datetime-picker'
import {
  SideDrawerSection,
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { getEditableQuotaStep } from '@/lib/format'

import { createInviteCode } from '../api'
import {
  getInviteCodeFormSchema,
  type InviteCodeFormValues,
  INVITE_CODE_FORM_DEFAULT_VALUES,
  transformFormDataToPayload,
} from '../lib'

import { useInviteCodes } from './invite-codes-provider'

type InviteCodesGenerateDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InviteCodesMutateDrawer({
  open,
  onOpenChange,
}: InviteCodesGenerateDrawerProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useInviteCodes()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<InviteCodeFormValues>({
    resolver: zodResolver(getInviteCodeFormSchema(t)),
    defaultValues: INVITE_CODE_FORM_DEFAULT_VALUES,
  })

  const onSubmit = async (data: InviteCodeFormValues) => {
    setIsSubmitting(true)
    try {
      const payload = transformFormDataToPayload(data)
      const result = await createInviteCode(payload)
      if (result.success) {
        toast.success(t('Invite Code created successfully'))
        onOpenChange(false)
        form.reset(INVITE_CODE_FORM_DEFAULT_VALUES)
        triggerRefresh()
      } else {
        toast.error(t('Failed to create invite code'))
      }
    } catch (err) {
      toast.error(t('Failed to create invite code'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const { meta: currencyMeta } = getCurrencyDisplay()
  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'
  const quotaStep = getEditableQuotaStep()
  const quotaPlaceholder = tokensOnly
    ? t('Enter quota in tokens')
    : t('Enter quota in {{currency}}', { currency: currencyLabel })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={sideDrawerContentClassName()}>
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('Generate Invite Codes')}</SheetTitle>
          <SheetDescription>
            {t('Create invite codes for new user registration')}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            className={sideDrawerFormClassName()}
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <SideDrawerSection>
              <FormField
                control={form.control}
                name='count'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Number of codes')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={1000}
                        placeholder={t('e.g. 10')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('How many invite codes to generate (1-1000)')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='quota_dollars'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Bonus quota')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        step={quotaStep}
                        placeholder={quotaPlaceholder}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('0 = threshold-only, no quota bonus')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='max_use_count'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Max uses per code')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={0}
                        placeholder={t('e.g. 1')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('0 = unlimited, 1 = single use')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='expired_time'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Expiration')}</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t('Never expires')}
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Optional: leave empty for no expiration')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </SideDrawerSection>
          </form>
        </Form>

        <SheetFooter className={sideDrawerFooterClassName()}>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={isSubmitting}>
            {t('Generate')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

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
import { useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const REWARD_TYPE_QUOTA = 'quota'
const REWARD_TYPE_RESET_CARD = 'reset_card'

const schema = z.object({
  enabled: z.boolean(),
  repo: z.string().trim().max(160),
  rewardType: z.enum([REWARD_TYPE_QUOTA, REWARD_TYPE_RESET_CARD]),
  quota: z.coerce.number().int().min(0),
  resetCardCount: z.coerce.number().int().min(1).max(1000),
  token: z.string().trim().max(255),
})

type Values = z.infer<typeof schema>

export type GitHubStarSettingsDefaults = {
  enabled: boolean
  repo: string
  rewardType: string
  quota: number
  resetCardCount: number
  token: string
}

export function GitHubStarSettingsSection(props: {
  defaultValues: GitHubStarSettingsDefaults
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: {
      enabled: props.defaultValues.enabled,
      repo: props.defaultValues.repo,
      rewardType:
        props.defaultValues.rewardType === REWARD_TYPE_RESET_CARD
          ? REWARD_TYPE_RESET_CARD
          : REWARD_TYPE_QUOTA,
      quota: props.defaultValues.quota,
      resetCardCount: props.defaultValues.resetCardCount,
      token: props.defaultValues.token,
    },
  })

  const { isDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')
  const rewardType = form.watch('rewardType')

  async function onSubmit(values: Values) {
    const updates: Array<{ key: string; value: string }> = []

    if (values.enabled !== props.defaultValues.enabled) {
      updates.push({
        key: 'github_star_setting.enabled',
        value: String(values.enabled),
      })
    }
    if (values.repo !== props.defaultValues.repo) {
      updates.push({ key: 'github_star_setting.repo', value: values.repo })
    }
    if (values.rewardType !== props.defaultValues.rewardType) {
      updates.push({
        key: 'github_star_setting.reward_type',
        value: values.rewardType,
      })
    }
    if (values.quota !== props.defaultValues.quota) {
      updates.push({
        key: 'github_star_setting.quota',
        value: String(values.quota),
      })
    }
    if (values.resetCardCount !== props.defaultValues.resetCardCount) {
      updates.push({
        key: 'github_star_setting.reset_card_count',
        value: String(values.resetCardCount),
      })
    }
    if (values.token !== props.defaultValues.token) {
      updates.push({ key: 'github_star_setting.token', value: values.token })
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    form.reset(values)
  }

  return (
    <SettingsSection title={t('GitHub Star Task')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || isSubmitting}
            isSaveDisabled={!isDirty}
            saveLabel='Save GitHub star settings'
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable GitHub star task')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Users who star the configured repository can claim a one-time reward; verification is automatic'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={updateOption.isPending || isSubmitting}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          {enabled && (
            <>
              <FormField
                control={form.control}
                name='repo'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('GitHub repository')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder='owner/repo'
                        autoComplete='off'
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Repository in owner/repo format')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid gap-6 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='rewardType'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Reward type')}</FormLabel>
                      <Select
                        items={[
                          { value: REWARD_TYPE_QUOTA, label: t('Quota') },
                          {
                            value: REWARD_TYPE_RESET_CARD,
                            label: t('Reset Card'),
                          },
                        ]}
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t('Select reward type')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            <SelectItem value={REWARD_TYPE_QUOTA}>
                              {t('Quota')}
                            </SelectItem>
                            <SelectItem value={REWARD_TYPE_RESET_CARD}>
                              {t('Reset Card')}
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t(
                          'Choose whether users receive quota or reset cards'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {rewardType === REWARD_TYPE_RESET_CARD ? (
                  <FormField
                    control={form.control}
                    name='resetCardCount'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Reset card count')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min={1}
                            max={1000}
                            placeholder='1'
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Number of reset cards granted per claim (1-1000)')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <FormField
                    control={form.control}
                    name='quota'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Reward quota')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min={0}
                            placeholder='10000'
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Quota granted per claim')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <FormField
                control={form.control}
                name='token'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('GitHub access token (optional)')}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type='password'
                        autoComplete='off'
                        placeholder='ghp_...'
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Used only to verify the star state; a token raises the GitHub API rate limit'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}

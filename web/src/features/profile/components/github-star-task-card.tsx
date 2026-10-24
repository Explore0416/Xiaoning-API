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
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, Star } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { IconGithub } from '@/assets/brand-icons'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { handleServerError } from '@/lib/handle-server-error'
import { createServerError } from '@/lib/server-error-message'

import { claimGitHubStarReward, getGitHubStarTaskStatus } from '../api'

export function GitHubStarTaskCard() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [githubUsername, setGitHubUsername] = useState('')
  const [claiming, setClaiming] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['github-star-task'],
    queryFn: async () => {
      const res = await getGitHubStarTaskStatus()
      if (res.success && res.data) {
        return res.data
      }
      throw createServerError(res, t('Failed to fetch GitHub star task'))
    },
    staleTime: 30000,
  })

  if (isLoading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <div className='p-6'>
          <div className='flex items-start justify-between gap-4'>
            <div className='flex items-center gap-3'>
              <Skeleton className='h-10 w-10 rounded-xl' />
              <div className='space-y-2'>
                <Skeleton className='h-5 w-32' />
                <Skeleton className='h-3 w-56' />
              </div>
            </div>
            <Skeleton className='h-9 w-24 rounded-md' />
          </div>
        </div>
      </Card>
    )
  }

  if (!data?.enabled) {
    return null
  }

  const repoUrl = `https://github.com/${data.repo}`
  const rewardLabel =
    data.reward_type === 'reset_card'
      ? t('{{count}} reset cards', { count: data.reset_card_count })
      : formatQuotaWithCurrency(data.quota, { digitsLarge: 0 })

  const handleClaim = async () => {
    setClaiming(true)
    try {
      const res = await claimGitHubStarReward(githubUsername.trim() || undefined)
      if (res.success && res.data) {
        const granted =
          res.data.reward_type === 'reset_card'
            ? t('{{count}} reset cards', {
                count: res.data.reset_card_count,
              })
            : formatQuotaWithCurrency(res.data.quota, { digitsLarge: 0 })
        toast.success(t('Reward claimed: {{reward}}', { reward: granted }))
        if (res.data.reward_type === 'reset_card') {
          window.dispatchEvent(new Event('reset-cards:refresh'))
        }
        await refetch()
      } else {
        handleServerError(res, t('Failed to claim reward'))
      }
    } catch (error) {
      handleServerError(error, t('Failed to claim reward'))
    } finally {
      setClaiming(false)
    }
  }

  let claimButtonLabel = t('Claim reward')
  if (claiming) {
    claimButtonLabel = t('Verifying...')
  } else if (data.claimed) {
    claimButtonLabel = t('Claimed')
  }

  return (
    <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
      <div className='border-b p-4 sm:p-6'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4'>
          <button
            type='button'
            className='flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left whitespace-normal outline-none'
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <IconBadge tone='neutral' size='lg' className='sm:size-11'>
              <IconGithub className='h-4 w-4 sm:h-5 sm:w-5' strokeWidth={2} />
            </IconBadge>
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <h3 className='text-base font-semibold tracking-tight'>
                  {t('GitHub Star Reward')}
                </h3>
                {data.claimed && (
                  <StatusBadge
                    label={t('Claimed')}
                    variant='success'
                    copyable={false}
                  />
                )}
                <span className='text-muted-foreground inline-flex items-center'>
                  {collapsed ? (
                    <ChevronDown className='h-4 w-4' />
                  ) : (
                    <ChevronUp className='h-4 w-4' />
                  )}
                </span>
              </div>
              <p className='text-muted-foreground mt-1 line-clamp-2 text-xs sm:text-sm'>
                {t('Star {{repo}} on GitHub to receive {{reward}}', {
                  repo: data.repo,
                  reward: rewardLabel,
                })}
              </p>
            </div>
          </button>
          <Button
            variant='outline'
            size='sm'
            className='w-full shrink-0 sm:w-auto'
            render={
              <a href={repoUrl} target='_blank' rel='noopener noreferrer' />
            }
          >
            {t('Open repository')}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className='space-y-4 p-4 sm:p-6'>
          <div className='flex items-center gap-3 rounded-lg border p-3'>
            <IconBadge tone='neutral' size='md'>
              <Star className='h-4 w-4' strokeWidth={2} />
            </IconBadge>
            <div className='min-w-0'>
              <div className='text-sm font-medium'>{t('One-time reward')}</div>
              <div className='text-muted-foreground mt-0.5 text-xs'>
                {rewardLabel}
              </div>
            </div>
          </div>

          {data.claimed ? (
            <div className='text-muted-foreground rounded-lg border p-3 text-xs'>
              {t(
                'You have already claimed this reward. Thank you for your support!'
              )}
            </div>
          ) : (
            <div className='space-y-2'>
              <Label htmlFor='github-star-username'>
                {t('GitHub username')}
              </Label>
              <div className='flex flex-col gap-2 sm:flex-row'>
                <Input
                  id='github-star-username'
                  value={githubUsername}
                  placeholder={t('Enter your GitHub username')}
                  onChange={(event) => setGitHubUsername(event.target.value)}
                />
                <Button
                  onClick={handleClaim}
                  disabled={claiming}
                  className='w-full shrink-0 sm:w-auto'
                >
                  {claimButtonLabel}
                </Button>
              </div>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Leave empty to use your bound GitHub account; verification is automatic'
                )}
              </p>
            </div>
          )}

          <div className='bg-muted/30 text-muted-foreground rounded-lg border p-3 text-xs'>
            <ul className='list-disc space-y-1 pl-5'>
              <li>{t('Open the repository and click Star')}</li>
              <li>
                {t(
                  'Come back and claim the reward; your star is verified automatically'
                )}
              </li>
              <li>{t('Each account can claim this reward once')}</li>
            </ul>
          </div>
        </div>
      )}
    </Card>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Activity, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { getSuccessRateDotClass } from '@/features/performance-metrics/lib/format'
import { cn } from '@/lib/utils'

import {
  getModelChannelMonitoring,
  type ModelChannelMonitoring,
} from './monitoring-api'

const ranges = [7, 15, 30] as const

type MonitoringRange = (typeof ranges)[number]

function formatLatency(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return value >= 1000
    ? `${(value / 1000).toFixed(2)}s`
    : `${Math.round(value)}ms`
}

function MonitoringCard({ item }: { item: ModelChannelMonitoring }) {
  const { t } = useTranslation()
  const hasRequests = item.request_count > 0
  const statusLabel = item.channel_status === 1 ? t('Enabled') : t('Disabled')
  const statusClass =
    item.channel_status === 1 ? 'text-success' : 'text-destructive'
  const recent = item.recent.reduce<Array<{ key: string; success: boolean }>>(
    (entries, success) => [
      ...entries,
      {
        success,
        key: `${item.channel_id}-${item.model}-${success ? 'success' : 'failure'}-${entries.length}`,
      },
    ],
    []
  )

  return (
    <Card size='sm'>
      <CardHeader className='border-b'>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <CardTitle className='truncate font-mono text-sm'>
              {item.model}
            </CardTitle>
            <p className='text-muted-foreground mt-1 truncate text-xs'>
              {item.channel_name}
            </p>
          </div>
          <Badge variant='outline' className={cn('shrink-0', statusClass)}>
            <Activity className='mr-1 h-3 w-3' />
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-3 gap-2 text-center'>
          <div>
            <p className='text-muted-foreground text-xs'>{t('Latency')}</p>
            <p className='mt-1 font-mono text-sm'>
              {formatLatency(item.average_latency)}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs'>{t('PING')}</p>
            <p className='mt-1 font-mono text-sm'>
              {formatLatency(item.response_time)}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs'>{t('Availability')}</p>
            <p className='mt-1 font-mono text-sm'>
              {hasRequests ? `${item.availability.toFixed(1)}%` : '—'}
            </p>
          </div>
        </div>
        <div>
          <div className='mb-2 flex items-center justify-between text-xs'>
            <span className='text-muted-foreground'>
              {t('Recent requests')}
            </span>
            <span className='text-muted-foreground'>{item.request_count}</span>
          </div>
          <div className='flex min-h-3 items-center gap-0.5'>
            {item.recent.length > 0 ? (
              recent.map(({ key, success }) => (
                <span
                  key={key}
                  className={cn(
                    'h-3 min-w-1 flex-1 rounded-sm',
                    success ? 'bg-success' : 'bg-destructive'
                  )}
                  title={success ? t('Success') : t('Failed')}
                />
              ))
            ) : (
              <span className='text-muted-foreground text-xs'>
                {t('No request history')}
              </span>
            )}
          </div>
          {hasRequests && (
            <div className='mt-2 flex items-center gap-1 text-xs'>
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  getSuccessRateDotClass(item.availability)
                )}
              />
              {t('{{count}} requests in selected range', {
                count: item.request_count,
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function ModelMonitoring() {
  const { t } = useTranslation()
  const [days, setDays] = useState<MonitoringRange>(7)
  const monitoringQuery = useQuery({
    queryKey: ['model-channel-monitoring', days],
    queryFn: () => getModelChannelMonitoring(days),
    retry: false,
  })
  const items = monitoringQuery.data?.data ?? []

  let content
  if (monitoringQuery.isLoading) {
    content = (
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className='h-56' />
        ))}
      </div>
    )
  } else if (
    monitoringQuery.isError ||
    monitoringQuery.data?.success === false
  ) {
    content = (
      <div className='text-destructive rounded-md border p-8 text-center text-sm'>
        {t('Failed to load model monitoring data')}
      </div>
    )
  } else if (items.length === 0) {
    content = (
      <div className='text-muted-foreground rounded-md border p-8 text-center text-sm'>
        {t('No model monitoring data available')}
      </div>
    )
  } else {
    content = (
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
        {items.map((item) => (
          <MonitoringCard
            key={`${item.channel_id}-${item.model}`}
            item={item}
          />
        ))}
      </div>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Model Monitoring')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex rounded-md border p-1'>
            {ranges.map((range) => (
              <Button
                key={range}
                size='sm'
                variant={days === range ? 'secondary' : 'ghost'}
                onClick={() => setDays(range)}
              >
                {t('{{count}} days', { count: range })}
              </Button>
            ))}
          </div>
          <Button
            size='sm'
            variant='outline'
            onClick={() => monitoringQuery.refetch()}
            disabled={monitoringQuery.isFetching}
          >
            <RefreshCw className='mr-2 h-4 w-4' />
            {t('Refresh')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='min-h-full'>{content}</div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

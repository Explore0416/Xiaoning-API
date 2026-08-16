import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ChevronDown,
  HeartPulse,
  RefreshCw,
  Server,
  Timer,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatLatency,
  formatUptimePct,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import {
  getChannelStatusBadge,
  getChannelTypeIcon,
  getChannelTypeLabel,
} from './lib'
import {
  calculateMonitoringSummary,
  getModelHealth,
  sortMonitoringItems,
  type ModelHealth,
} from './lib/model-monitoring'
import {
  getModelMonitoring,
  type ModelMonitoringChannel,
  type ModelMonitoringItem,
} from './monitoring-api'

const ranges = [7, 15, 30] as const
type MonitoringRange = (typeof ranges)[number]

type HealthConfig = {
  label: string
  description: string
  variant: StatusVariant
  dotClassName: string
}

const healthConfig: Record<ModelHealth, HealthConfig> = {
  operational: {
    label: 'Operational',
    description: 'Requests and channels are operating normally.',
    variant: 'success',
    dotClassName: 'bg-success',
  },
  degraded: {
    label: 'Degraded',
    description: 'Some requests failed or some channels are unavailable.',
    variant: 'warning',
    dotClassName: 'bg-warning',
  },
  unavailable: {
    label: 'Unavailable',
    description: 'The model or all of its channels are unavailable.',
    variant: 'danger',
    dotClassName: 'bg-destructive',
  },
  unknown: {
    label: 'No data',
    description: 'No requests were observed in the selected range.',
    variant: 'neutral',
    dotClassName: 'bg-muted-foreground',
  },
}

function MetricCell(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone: IconBadgeTone
}) {
  const Icon = props.icon
  return (
    <div className='bg-muted/40 rounded-xl px-3 py-2.5 sm:px-4'>
      <div className='text-muted-foreground flex items-center gap-1.5 text-xs font-medium'>
        <IconBadge tone={props.tone} size='xs'>
          <Icon />
        </IconBadge>
        <span className='truncate'>{props.label}</span>
      </div>
      <div className='text-foreground mt-1.5 text-sm font-semibold tabular-nums'>
        {props.value}
      </div>
    </div>
  )
}

function RequestHistory(props: { item: ModelMonitoringItem }) {
  const { t } = useTranslation()
  if (props.item.recent.length === 0) {
    return (
      <span className='text-muted-foreground text-xs'>
        {t('No request history')}
      </span>
    )
  }

  const successes = props.item.recent.filter(Boolean).length
  const failures = props.item.recent.length - successes
  let successesSeen = 0
  let failuresSeen = 0
  const history = [...props.item.recent].reverse().map((success) => {
    if (success) {
      successesSeen++
      return { success, key: `success-${successesSeen}` }
    }
    failuresSeen++
    return { success, key: `failure-${failuresSeen}` }
  })

  return (
    <div className='min-w-0 flex-1'>
      <div
        className='flex h-7 min-w-0 items-stretch gap-0.5'
        aria-label={t(
          '{{successes}} successful and {{failures}} failed recent requests',
          {
            successes,
            failures,
          }
        )}
      >
        {history.map((entry) => (
          <span
            key={`${props.item.model}-${entry.key}`}
            className={cn(
              'min-w-0 flex-1 rounded-sm',
              entry.success ? 'bg-success' : 'bg-destructive'
            )}
            title={entry.success ? t('Success') : t('Failed')}
          />
        ))}
      </div>
      <div className='text-muted-foreground mt-1 flex justify-between text-xs'>
        <span>{t('Older')}</span>
        <span>{t('Latest')}</span>
      </div>
    </div>
  )
}

function ChannelDetail(props: { channel: ModelMonitoringChannel }) {
  const { t } = useTranslation()
  const status = getChannelStatusBadge(props.channel.channel_status)

  return (
    <div className='grid gap-3 border-t px-4 py-3 sm:grid-cols-[minmax(0,1fr)_repeat(4,minmax(80px,auto))] sm:items-center sm:px-5'>
      <div className='flex min-w-0 items-center gap-2.5'>
        <div className='bg-muted/40 flex size-8 shrink-0 items-center justify-center rounded-lg'>
          {getLobeIcon(getChannelTypeIcon(props.channel.channel_type), 18) || (
            <Server className='text-muted-foreground size-4' />
          )}
        </div>
        <div className='min-w-0'>
          <div className='truncate text-sm font-medium'>
            {props.channel.channel_name}
          </div>
          <div className='text-muted-foreground truncate text-xs'>
            {t(getChannelTypeLabel(props.channel.channel_type))}
          </div>
        </div>
      </div>
      <div>
        <div className='text-muted-foreground mb-1 text-xs'>{t('Status')}</div>
        <StatusBadge
          label={t(status.label)}
          variant={status.variant}
          copyable={false}
          size='sm'
        />
      </div>
      <DetailMetric
        label={t('PING')}
        value={formatLatency(props.channel.response_time)}
      />
      <DetailMetric
        label={t('Availability')}
        value={
          props.channel.request_count > 0
            ? formatUptimePct(props.channel.availability)
            : '—'
        }
      />
      <DetailMetric
        label={t('Requests')}
        value={
          props.channel.request_count
            ? String(props.channel.request_count)
            : '—'
        }
      />
    </div>
  )
}

function DetailMetric(props: { label: string; value: string }) {
  return (
    <div>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1 text-sm font-medium tabular-nums'>{props.value}</div>
    </div>
  )
}

function ModelStatusItem(props: { item: ModelMonitoringItem }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const health = getModelHealth(props.item)
  const config = healthConfig[health]
  const primaryChannel = props.item.channels[0]

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className='bg-card overflow-hidden rounded-xl border'>
        <CollapsibleTrigger className='hover:bg-muted/30 w-full text-left transition-colors'>
          <div className='grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(220px,1fr)_minmax(240px,1.5fr)_auto] lg:items-center'>
            <div className='flex min-w-0 items-start gap-3'>
              <span
                className={cn(
                  'mt-2 size-2.5 shrink-0 rounded-full',
                  config.dotClassName
                )}
                aria-hidden='true'
              />
              <div className='min-w-0'>
                <div className='flex min-w-0 flex-wrap items-center gap-2'>
                  <span className='truncate text-base font-semibold'>
                    {props.item.model}
                  </span>
                  <StatusBadge
                    label={t(config.label)}
                    variant={config.variant}
                    copyable={false}
                    size='sm'
                  />
                </div>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t(config.description)}
                </p>
                {primaryChannel && (
                  <div className='text-muted-foreground mt-2 flex items-center gap-1.5 text-xs'>
                    {getLobeIcon(
                      getChannelTypeIcon(primaryChannel.channel_type),
                      14
                    )}
                    <span>
                      {t('{{available}} of {{total}} channels available', {
                        available: props.item.available_channel_count,
                        total: props.item.channel_count,
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <RequestHistory item={props.item} />

            <div className='flex flex-wrap items-center gap-x-6 gap-y-3 lg:justify-end'>
              <div>
                <div className='text-muted-foreground text-xs'>
                  {t('Availability')}
                </div>
                <div
                  className={cn(
                    'mt-1 text-lg font-semibold tabular-nums',
                    props.item.request_count > 0
                      ? getSuccessRateTextClass(props.item.availability)
                      : 'text-muted-foreground'
                  )}
                >
                  {props.item.request_count > 0
                    ? formatUptimePct(props.item.availability)
                    : '—'}
                </div>
              </div>
              <DetailMetric
                label={t('Average latency')}
                value={formatLatency(props.item.average_latency)}
              />
              <DetailMetric
                label={t('Requests')}
                value={
                  props.item.request_count
                    ? String(props.item.request_count)
                    : '—'
                }
              />
              <span className='text-muted-foreground flex items-center gap-1 text-xs'>
                {t('Channel details')}
                <ChevronDown
                  className={cn(
                    'size-4 transition-transform',
                    open && 'rotate-180'
                  )}
                  aria-hidden='true'
                />
              </span>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className='bg-muted/10'>
          {props.item.channels.map((channel) => (
            <ChannelDetail key={channel.channel_id} channel={channel} />
          ))}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export function ModelMonitoring() {
  const { t } = useTranslation()
  const [days, setDays] = useState<MonitoringRange>(7)
  const monitoringQuery = useQuery({
    queryKey: ['model-monitoring', days],
    queryFn: () => getModelMonitoring(days),
    retry: false,
  })
  const items = useMemo(
    () => sortMonitoringItems(monitoringQuery.data?.data ?? []),
    [monitoringQuery.data]
  )
  const summary = useMemo(() => calculateMonitoringSummary(items), [items])

  let content
  if (monitoringQuery.isLoading) {
    content = (
      <div className='space-y-3'>
        {[1, 2, 3].map((item) => (
          <Skeleton key={item} className='h-36 rounded-xl' />
        ))}
      </div>
    )
  } else if (
    monitoringQuery.isError ||
    monitoringQuery.data?.success === false
  ) {
    content = (
      <div className='text-destructive rounded-xl border p-10 text-center text-sm'>
        {t('Failed to load model monitoring data')}
      </div>
    )
  } else if (items.length === 0) {
    content = (
      <div className='text-muted-foreground rounded-xl border p-10 text-center text-sm'>
        {t('No model monitoring data available')}
      </div>
    )
  } else {
    content = (
      <div className='space-y-3'>
        {items.map((item) => (
          <ModelStatusItem key={item.model} item={item} />
        ))}
      </div>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        <span className='flex min-w-0 items-center gap-2'>
          <IconBadge tone='success' size='title'>
            <HeartPulse />
          </IconBadge>
          <span className='truncate'>{t('Model Monitoring')}</span>
        </span>
      </SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <div className='flex flex-wrap items-center gap-2'>
          <div className='flex rounded-md border p-1'>
            {ranges.map((range) => (
              <Button
                key={range}
                type='button'
                variant={days === range ? 'secondary' : 'ghost'}
                size='xs'
                onClick={() => setDays(range)}
              >
                {t('{{count}} days', { count: range })}
              </Button>
            ))}
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => monitoringQuery.refetch()}
            disabled={monitoringQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                'size-3.5',
                monitoringQuery.isFetching && 'animate-spin'
              )}
            />
            {t('Refresh')}
          </Button>
        </div>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <section className='bg-card overflow-hidden rounded-xl border'>
            <div className='flex items-center gap-2 border-b px-4 py-3 sm:px-5'>
              <IconBadge tone='info' size='sm'>
                <Activity />
              </IconBadge>
              <div>
                <h3 className='text-sm font-medium'>
                  {t('Model availability')}
                </h3>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Live channel state and real request results for the selected range.'
                  )}
                </p>
              </div>
            </div>
            <div className='grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 sm:p-5'>
              <MetricCell
                icon={Server}
                label={t('Models')}
                value={summary.total ? String(summary.total) : '—'}
                tone='info'
              />
              <MetricCell
                icon={Activity}
                label={t('Requests')}
                value={summary.requests ? String(summary.requests) : '—'}
                tone='primary'
              />
              <MetricCell
                icon={HeartPulse}
                label={t('Availability')}
                value={
                  summary.requests ? formatUptimePct(summary.availability) : '—'
                }
                tone='success'
              />
              <MetricCell
                icon={Timer}
                label={t('Average latency')}
                value={summary.requests ? formatLatency(summary.latency) : '—'}
                tone='warning'
              />
            </div>
          </section>
          {content}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

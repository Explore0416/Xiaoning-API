import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  CheckCircle2,
  HeartPulse,
  RefreshCw,
  Server,
  Timer,
  TriangleAlert,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  StaticDataTable,
  staticDataTableClassNames as tableStyles,
} from '@/components/data-table'
import { SectionPageLayout } from '@/components/layout'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
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
import { calculateMonitoringSummary } from './lib/model-monitoring'
import {
  getModelChannelMonitoring,
  type ModelChannelMonitoring,
} from './monitoring-api'

const ranges = [7, 15, 30] as const
type MonitoringRange = (typeof ranges)[number]

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

function RecentRequests({ item }: { item: ModelChannelMonitoring }) {
  const { t } = useTranslation()
  if (item.recent.length === 0) {
    return (
      <span className='text-muted-foreground text-xs'>
        {t('No request history')}
      </span>
    )
  }

  const recent = item.recent.reduce<Array<{ key: string; success: boolean }>>(
    (entries, success) => [
      ...entries,
      {
        success,
        key: `${item.channel_id}-${item.model}-${success ? 'success' : 'failure'}-${entries.length + 1}`,
      },
    ],
    []
  )

  return (
    <div
      className='flex items-center gap-0.5'
      aria-label={t('Recent requests')}
    >
      {recent.map((entry) => (
        <span
          key={entry.key}
          className={cn(
            'h-3 w-1 rounded-sm',
            entry.success ? 'bg-success' : 'bg-destructive'
          )}
          title={entry.success ? t('Success') : t('Failed')}
        />
      ))}
    </div>
  )
}

function ChannelHealthStatus({ item }: { item: ModelChannelMonitoring }) {
  const { t } = useTranslation()
  const config = getChannelStatusBadge(item.channel_status)
  const hasRequests = item.request_count > 0
  let tone: IconBadgeTone = 'neutral'
  let Icon = Activity
  if (hasRequests) {
    if (item.availability >= 99) {
      tone = 'success'
      Icon = CheckCircle2
    } else if (item.availability >= 90) {
      tone = 'warning'
      Icon = TriangleAlert
    } else {
      tone = 'destructive'
      Icon = TriangleAlert
    }
  }

  return (
    <div className='flex min-w-[122px] items-center gap-2'>
      <IconBadge tone={tone} size='xs'>
        <Icon />
      </IconBadge>
      <div className='min-w-0'>
        <StatusBadge
          label={t(config.label)}
          variant={config.variant}
          copyable={false}
          size='sm'
        />
        <div className='text-muted-foreground mt-0.5 text-xs'>
          {hasRequests
            ? t('Observed in selected range')
            : t('No request history')}
        </div>
      </div>
    </div>
  )
}

function MonitoringTable({ items }: { items: ModelChannelMonitoring[] }) {
  const { t } = useTranslation()
  return (
    <StaticDataTable
      className='rounded-xl'
      tableClassName='min-w-[980px] text-sm'
      headerRowClassName={tableStyles.compactHeaderRow}
      data={items}
      getRowKey={(item) => `${item.channel_id}-${item.model}`}
      columns={[
        {
          id: 'model',
          header: t('Model'),
          className: cn(tableStyles.compactHeaderCell, 'min-w-[220px]'),
          cellClassName: tableStyles.compactTopCell,
          cell: (item) => (
            <div className='flex min-w-0 items-center gap-2.5'>
              <div className='bg-muted/40 flex size-8 shrink-0 items-center justify-center rounded-lg'>
                {getLobeIcon(getChannelTypeIcon(item.channel_type), 18) || (
                  <Server className='text-muted-foreground size-4' />
                )}
              </div>
              <div className='min-w-0'>
                <div className='truncate font-mono text-sm font-semibold'>
                  {item.model}
                </div>
                <div className='text-muted-foreground mt-0.5 truncate text-xs'>
                  {t(getChannelTypeLabel(item.channel_type))}
                </div>
              </div>
            </div>
          ),
        },
        {
          id: 'channel',
          header: t('Channel'),
          className: tableStyles.compactHeaderCell,
          cellClassName: tableStyles.compactTopCell,
          cell: (item) => (
            <div className='min-w-[150px]'>
              <div className='truncate font-medium'>{item.channel_name}</div>
              <div className='text-muted-foreground mt-0.5 font-mono text-xs'>
                #{item.channel_id}
              </div>
            </div>
          ),
        },
        {
          id: 'status',
          header: t('Status'),
          className: tableStyles.compactHeaderCell,
          cellClassName: tableStyles.compactTopCell,
          cell: (item) => <ChannelHealthStatus item={item} />,
        },
        {
          id: 'ping',
          header: t('PING'),
          className: tableStyles.compactHeaderCellRight,
          cellClassName: tableStyles.compactMutedNumericCell,
          cell: (item) => formatLatency(item.response_time),
        },
        {
          id: 'latency',
          header: t('Average latency'),
          className: tableStyles.compactHeaderCellRight,
          cellClassName: tableStyles.compactNumericCell,
          cell: (item) => formatLatency(item.average_latency),
        },
        {
          id: 'availability',
          header: t('Availability'),
          className: tableStyles.compactHeaderCellRight,
          cellClassName: tableStyles.compactNumericCell,
          cell: (item) =>
            item.request_count > 0 ? (
              <span className={getSuccessRateTextClass(item.availability)}>
                {formatUptimePct(item.availability)}
              </span>
            ) : (
              '—'
            ),
        },
        {
          id: 'requests',
          header: t('Requests'),
          className: tableStyles.compactHeaderCellRight,
          cellClassName: tableStyles.compactMutedNumericCell,
          cell: (item) => item.request_count || '—',
        },
        {
          id: 'recent',
          header: t('Recent requests'),
          className: cn(tableStyles.compactHeaderCell, 'min-w-[180px]'),
          cellClassName: tableStyles.compactCell,
          cell: (item) => <RecentRequests item={item} />,
        },
      ]}
    />
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
  const summary = calculateMonitoringSummary(items)

  let content
  if (monitoringQuery.isLoading) {
    content = <Skeleton className='h-[420px] rounded-xl' />
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
    content = <MonitoringTable items={items} />
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
            <RefreshCw className='size-3.5' />
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
                <h3 className='text-sm font-semibold'>
                  {t('Monitoring overview')}
                </h3>
                <p className='text-muted-foreground text-xs'>
                  {t(
                    'Real request and channel test data for the selected range.'
                  )}
                </p>
              </div>
            </div>
            <div className='grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 sm:p-5'>
              <MetricCell
                icon={Server}
                label={t('Model channels')}
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

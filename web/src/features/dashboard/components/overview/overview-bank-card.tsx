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
import { Nfc } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface OverviewBankCardProps {
  apiKey?: string
  holder?: string
}

function maskApiKey(apiKey?: string): string {
  if (!apiKey) {
    return 'sk-••••••••••••'
  }
  const fullKey = apiKey.startsWith('sk-') ? apiKey : `sk-${apiKey}`
  if (fullKey.length <= 14) {
    return 'sk-••••••••'
  }
  return `${fullKey.slice(0, 7)}••••••${fullKey.slice(-4)}`
}

export function OverviewBankCard(props: OverviewBankCardProps) {
  const { t } = useTranslation()

  return (
    <div className='xn-bank-card'>
      <div className='relative flex items-start justify-between gap-4'>
        <div className='flex min-w-0 items-center gap-3'>
          <span className='xn-bank-card__chip' aria-hidden='true' />
          <div className='min-w-0'>
            <div className='xn-bank-card__brand truncate'>小柠同学API</div>
            <div className='xn-bank-card__label mt-0.5'>{t('API Card')}</div>
          </div>
        </div>
        <Nfc className='xn-bank-card__label size-5 shrink-0' aria-hidden='true' />
      </div>

      <div className='relative'>
        <div className='xn-bank-card__label'>{t('Card number')}</div>
        <div className='xn-bank-card__number truncate'>
          {maskApiKey(props.apiKey)}
        </div>
      </div>

      <div className='relative flex items-end justify-between gap-4'>
        <div className='min-w-0'>
          <div className='xn-bank-card__label'>{t('Card holder')}</div>
          <div className='xn-bank-card__value truncate'>
            {props.holder || t('API User')}
          </div>
        </div>
        <div className='shrink-0 text-right'>
          <div className='xn-bank-card__label'>{t('Valid thru')}</div>
          <div className='xn-bank-card__value'>∞</div>
        </div>
      </div>
    </div>
  )
}

import {usePageMessages} from '../../i18n/AdminI18nProvider'
import { Select, type SelectProps } from 'antd'
import { useScopeOption, withParams } from './useScopeOptions'

type Props = {
  value?: string
  onChange?: (value: string) => void
  bizCode?: string
  namespaceCode?: string
  disabled?: boolean
  placeholder?: string
}

const toArray = (value?: string): string[] => (value ? [value] : [])

const toValue = (values: string[]): string => values[0] ?? ''

const filterOption: SelectProps['filterOption'] = (input, option) =>
  String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())

export default function EnvSelect({ value, onChange, bizCode = '', namespaceCode = '', disabled, placeholder }: Props) {
  const {t} = usePageMessages('common')
  const query = useScopeOption(withParams(
    '/api/v1/tianshu/envs',
    { bizCode, namespaceCode },
  ))
  const envs = query.data ?? []
  return (
    <Select
      mode="tags"
      maxCount={1}
      showSearch
      value={toArray(value)}
      onChange={(values) => onChange?.(toValue(values))}
      options={envs.map((option) => ({ value: option.value, label: option.label }))}
      filterOption={filterOption}
      loading={query.isFetching}
      disabled={disabled}
      placeholder={placeholder ?? t('scope.envPlaceholder')}
      style={{ width: '100%' }}
      notFoundContent={t('scope.noOptions')}
    />
  )
}

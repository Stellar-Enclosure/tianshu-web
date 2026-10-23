import {Alert, Button, Empty, Skeleton, Space} from 'antd'
import type {PageStateProps} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {usePageMessages} from '../../i18n/AdminI18nProvider'
import {formatAdminError} from '../../i18n/errors'

export function AdminPageState({loading, error, empty, emptyDescription, skeleton, showPartial = false, onRetry, children}: PageStateProps) {
  const {t} = usePageMessages('common')
  if (loading) return skeleton ?? <Skeleton active paragraph={{rows: 5}} />
  if (error !== null && error !== undefined) {
    const message = formatAdminError(error, t)
    const banner = <Alert type="error" showIcon title={showPartial ? t('error.partial', {message}) : message}
      action={onRetry ? <Button size="small" onClick={onRetry}>{t('common.retry')}</Button> : undefined}
      style={{marginBottom: showPartial ? 16 : 0}} />
    return showPartial ? <Space direction="vertical" style={{width: '100%'}}>{banner}{children}</Space> : banner
  }
  if (empty) return <Empty description={emptyDescription ?? t('common.empty')} />
  return children
}

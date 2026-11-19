import {useLocation} from 'react-router-dom'
import {cloudDeliveryMessages} from '../permissions/messages'
import { Alert, Button, Card, Typography } from 'antd'
import { useAuth } from './AuthContext'
import {usePageMessages} from '../i18n/AdminI18nProvider'
import {LanguageSwitcher} from '../i18n/LanguageSwitcher'
import {formatAdminError} from '../i18n/errors'

export default function LoginPage() {
  const auth = useAuth()
  const {t, locale} = usePageMessages('tianshu.auth')
  const {pathname} = useLocation()
  const standaloneKey = 'auth.openStandalone'
  const standalone = t('auth.openStandalone')
  const standaloneDefault = cloudDeliveryMessages.find(message => message.pageCode === 'tianshu.auth' && message.key === standaloneKey)
  const standaloneLabel = standalone === standaloneKey
    ? standaloneDefault?.defaults[locale === 'en-US' ? 'en-US' : 'zh-CN'] : standalone
  return (
    <div style={{ maxWidth: 480, margin: '96px auto', padding: '0 16px' }}>
      <Card extra={<LanguageSwitcher />}>
        <Typography.Title level={4}>{t('auth.title')}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {t('auth.description')}
        </Typography.Paragraph>
        {auth.error && <Alert type="warning" showIcon message={formatAdminError(auth.error, t)} />}
        <Button type="primary" block loading={auth.loading} onClick={() => void auth.login(pathname)}>
          {t('auth.login')}
        </Button>
        {auth.standaloneUrl && <Typography.Link href={auth.standaloneUrl} target="_blank" rel="noopener noreferrer">
          {standaloneLabel}
        </Typography.Link>}
      </Card>
    </div>
  )
}

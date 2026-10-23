import { Alert, Button, Card, Typography } from 'antd'
import { useAuth } from './AuthContext'
import {usePageMessages} from '../i18n/AdminI18nProvider'
import {LanguageSwitcher} from '../i18n/LanguageSwitcher'
import {formatAdminError} from '../i18n/errors'

export default function LoginPage() {
  const auth = useAuth()
  const {t} = usePageMessages('tianshu.auth')
  return (
    <div style={{ maxWidth: 480, margin: '96px auto', padding: '0 16px' }}>
      <Card extra={<LanguageSwitcher />}>
        <Typography.Title level={4}>{t('auth.title')}</Typography.Title>
        <Typography.Paragraph type="secondary">
          {t('auth.description')}
        </Typography.Paragraph>
        {auth.error && <Alert type="warning" showIcon message={formatAdminError(auth.error, t)} />}
        <Button type="primary" block loading={auth.loading} onClick={() => void auth.login()}>
          {t('auth.login')}
        </Button>
      </Card>
    </div>
  )
}

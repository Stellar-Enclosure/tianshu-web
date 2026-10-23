import type {ReactNode} from 'react'
import {Spin} from 'antd'
import {useAuth} from './AuthContext'
import LoginPage from './LoginPage'
import {usePageMessages} from '../i18n/AdminI18nProvider'

export function RequireAuth({ children }: { children: ReactNode }) {
  const {t} = usePageMessages('common')
    const {authorized, loading} = useAuth()
  if (loading) return <Spin fullscreen description={t('auth.checking')} />
    if (!authorized) return <LoginPage/>
  return <>{children}</>
}

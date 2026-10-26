import {createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import type {GatewayIdentityResult} from '@stellar-enclosure/stellar-enclosure-web-shared'
import {isPermissionSnapshot, snapshotContext, type PermissionSnapshot, type PermissionSnapshotContext} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import {usePermission} from '@stellar-enclosure/stellar-enclosure-web-shared/react-permissions'
import {resources} from '../permissions/resources'
import {gatewayAuth} from './gatewayAuth'
import {
  beginDdcSession,
  isCurrentDdcSession,
  setDdcExpectedTenantId,
  setDdcPermissionContext,
  getDdcRequestContext,
  setDdcTenantMismatchHandler,
  setDdcUnauthorizedHandler,
} from '../api/client'
import {cancelAndClearDdcQueryClient} from '../query/queryClient'
import {AdminMessageError} from '../i18n/errors'

type UnsavedChangesGuard = () => Promise<boolean>

export {gatewayAuth}

export type TianshuAuthorization = {
  readonly identity: GatewayIdentityResult
  readonly snapshot: PermissionSnapshot
  readonly binding: PermissionSnapshotContext
}

type AuthContextValue = {
  readonly authorization?: TianshuAuthorization
  readonly identity: string
  readonly tenantId: string
  readonly sessionGeneration: number
  readonly authorized: boolean
  loading: boolean
  error?: Error
  registerUnsavedChangesGuard: (guard: UnsavedChangesGuard) => () => void
  login: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({children}: {children: ReactNode}) {
  const queryClient = useQueryClient()
  const [authorization, setAuthorization] = useState<TianshuAuthorization>()
  const [sessionGeneration, setSessionGeneration] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error>()
  const unsavedChangesGuards = useRef(new Set<UnsavedChangesGuard>())
  const sessionTransitionPending = useRef(false)
  const identity = authorization?.identity.subject ?? ''
  const tenantId = authorization?.identity.tenantId ?? ''
  const permission = usePermission(authorization?.snapshot ?? null, authorization?.binding ?? null)
  const authorized = permission.allows(resources[0].requirement)

  const registerUnsavedChangesGuard = useCallback((guard: UnsavedChangesGuard) => {
    unsavedChangesGuards.current.add(guard)
    return () => {
      unsavedChangesGuards.current.delete(guard)
    }
  }, [])

  const runSessionTransition = useCallback(async (transition: () => Promise<void>): Promise<void> => {
    if (sessionTransitionPending.current) return
    sessionTransitionPending.current = true
    try {
      for (const guard of unsavedChangesGuards.current) {
        let allowed: boolean
        try {
          allowed = await guard()
        } catch {
          setError(new AdminMessageError('auth.guardFailed'))
          return
        }
        if (!allowed) return
      }
      await transition()
    } finally {
      sessionTransitionPending.current = false
    }
  }, [])

  const beginSession = useCallback((): number => {
    const generation = beginDdcSession()
    setSessionGeneration(generation)
    setDdcExpectedTenantId(undefined)
    setAuthorization(undefined)
    void cancelAndClearDdcQueryClient(queryClient)
    return generation
  }, [queryClient])

  const loadBootstrap = useCallback(async (generation: number): Promise<void> => {
    const identity = await gatewayAuth.identity()
    if (!isCurrentDdcSession(generation)) return
    const captured = gatewayAuth.context.capture()
    const snapshot = await gatewayAuth.bootstrap<unknown>('/api/v1/authorization/effective-permissions', captured.signal)
    captured.assertCurrent()
    if (!isPermissionSnapshot(snapshot) || snapshot.issuer !== identity.issuer || snapshot.subject !== identity.subject
      || snapshot.catalogScope.tenantId !== identity.tenantId || snapshot.catalogScope.businessCode !== 'xingyuan'
      || snapshot.catalogScope.applicationCode !== 'tianshu'
      || snapshot.catalogScope.namespaceCode !== (import.meta.env.VITE_PERMISSION_NAMESPACE ?? '')
      || snapshot.catalogScope.environment !== (import.meta.env.VITE_PERMISSION_ENVIRONMENT ?? '')
      || Date.parse(snapshot.snapshotExpiresAt) <= Date.now()) throw new Error('AUTH_CATALOG_SCOPE_MISMATCH')
    if (!isCurrentDdcSession(generation)) return
    const binding = snapshotContext(snapshot, captured.epoch)
    setDdcExpectedTenantId(identity.tenantId)
    setDdcPermissionContext(snapshot, binding)
    setAuthorization({identity, snapshot, binding})
  }, [])

  const clearAuthorization = useCallback(() => {
    beginSession()
    setError(undefined)
    setLoading(false)
  }, [beginSession])

  const refreshAfterTenantMismatch = useCallback(() => {
    const generation = beginSession()
    setError(undefined)
    setLoading(true)
    void loadBootstrap(generation).catch(failure => {
      if (isCurrentDdcSession(generation)) setError(failure instanceof Error ? failure : new AdminMessageError('auth.tenantFailed'))
    }).finally(() => { if (isCurrentDdcSession(generation)) setLoading(false) })
  }, [beginSession, loadBootstrap])

  const login = useCallback(async () => {
    await runSessionTransition(async () => {
      const generation = beginSession()
      setError(undefined)
      setLoading(true)
      try {
        gatewayAuth.login()
      } catch (failure) {
        if (isCurrentDdcSession(generation)) {
          setAuthorization(undefined)
          setError(failure instanceof Error ? failure : new AdminMessageError('auth.loginFailed'))
        }
      } finally {
        if (isCurrentDdcSession(generation)) setLoading(false)
      }
    })
  }, [beginSession, runSessionTransition])

  const logout = useCallback(async () => {
    await runSessionTransition(async () => {
      const generation = beginSession()
      setError(undefined)
      setLoading(true)
      try {
        const result = await gatewayAuth.logout()
        if (isCurrentDdcSession(generation) && result.remoteState !== 'CONFIRMED') {
          setError(new AdminMessageError('auth.remoteLogoutPending'))
        }
      } catch (failure) {
        if (isCurrentDdcSession(generation)) {
          setError(failure instanceof Error ? failure : new AdminMessageError('auth.logoutFailed'))
        }
      } finally {
        if (isCurrentDdcSession(generation)) setLoading(false)
      }
    })
  }, [beginSession, runSessionTransition])

  useEffect(() => {
    setDdcUnauthorizedHandler(clearAuthorization)
    setDdcTenantMismatchHandler(refreshAfterTenantMismatch)
    return () => {
      setDdcUnauthorizedHandler(() => {})
      setDdcTenantMismatchHandler(() => {})
    }
  }, [clearAuthorization, refreshAfterTenantMismatch])

  useEffect(() => {
    const generation = beginSession()
    let active = true
    setLoading(true)
    void loadBootstrap(generation)
      .catch(() => {
        if (active && isCurrentDdcSession(generation)) setAuthorization(undefined)
      })
      .finally(() => {
        if (active && isCurrentDdcSession(generation)) setLoading(false)
      })
    return () => {
      active = false
      if (isCurrentDdcSession(generation)) {
        beginDdcSession()
        setDdcExpectedTenantId(undefined)
        void cancelAndClearDdcQueryClient(queryClient)
      }
    }
  }, [beginSession, loadBootstrap, queryClient])

  useEffect(() => {
    if (!authorization) return
    const deadline = setTimeout(clearAuthorization, Math.max(1, Math.min(Date.parse(authorization.snapshot.snapshotExpiresAt) - Date.now(), 2_147_483_647)))
    const unsubscribe = gatewayAuth.context.subscribe(() => {
      if (getDdcRequestContext().tenantId && authorization.binding.requestEpoch !== gatewayAuth.context.epoch) clearAuthorization()
    })
    return () => { clearTimeout(deadline); unsubscribe() }
  }, [authorization, clearAuthorization])

  const value = useMemo(
    () => ({authorization, identity, tenantId, sessionGeneration, authorized, loading, error,
      registerUnsavedChangesGuard, login, logout}),
    [authorization, authorized, error, identity, loading, login, logout, registerUnsavedChangesGuard,
      sessionGeneration, tenantId],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}

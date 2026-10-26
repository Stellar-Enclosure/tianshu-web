import {act, cleanup, render, screen, waitFor} from '@testing-library/react'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {TianshuAuthorization} from '../auth/AuthContext'
import type {BackendFieldCatalog} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import {authorizationFixture} from '../test/permissionFixture'
import {PermissionButton, RequirePermission} from './access'
import {FieldCatalogProvider, useDdcWritable} from './FieldCatalog'
import {fieldReferences} from './fieldReferences'

const state = vi.hoisted(() => ({authorization: undefined as TianshuAuthorization | undefined, request: vi.fn()}))
vi.unmock('../permissions/access')
vi.unmock('../permissions/FieldCatalog')
vi.mock('../auth/AuthContext', () => ({useAuth: () => state}))
vi.mock('../api/client', () => ({ddcApi: (...args: unknown[]) => state.request(...args)}))

function Controls() {
  const writable = useDdcWritable('DdcAppBO')
  return <>
    <RequirePermission resourceKey="tianshu.page.apps"><span>application table</span></RequirePermission>
    <PermissionButton resourceKey="tianshu.button.AppsPage.write" disabled={!writable}>save application</PermissionButton>
    <input aria-label="application name" readOnly={!writable} />
  </>
}
const catalog = (): BackendFieldCatalog => ({
  catalogScope: state.authorization!.snapshot.catalogScope,
  catalogVersion: state.authorization!.snapshot.catalogVersion,
  fields: Object.fromEntries(fieldReferences.map(({key}) => [key, {
    access: 'PROTECTED', inputBinding: true,
    fieldPolicy: {valueType: 'STRING', plainRead: {mode: 'ALL', codes: ['TIANSHU_READ']}, write: {mode: 'ALL', codes: ['TIANSHU_WRITE']}},
  }])),
})
const responseFor = (path: string, response = catalog()): BackendFieldCatalog => {
  const keys = new URL(path, 'https://console.example').searchParams.getAll('keys')
  return {...response, fields: Object.fromEntries(Object.entries(response.fields).filter(([key]) => keys.includes(key)))}
}
const clients: QueryClient[] = []
function show() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})
  clients.push(client)
  const element = () => <QueryClientProvider client={client}><FieldCatalogProvider><Controls /></FieldCatalogProvider></QueryClientProvider>
  const view = render(element())
  return {...view, rerenderBinding: () => view.rerender(element())}
}

beforeEach(() => {
  state.authorization = authorizationFixture()
  state.request.mockReset().mockImplementation(async (path: string) => responseFor(path))
})
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.useRealTimers() })

describe('installed shared permission guards and backend field projection', () => {
  it('loads only stable field keys and enables a real writable input under the same full binding', async () => {
    show()
    expect(screen.getByRole('button', {name: 'save application'})).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('button', {name: 'save application'})).toBeEnabled())
    expect(screen.getByLabelText('application name')).not.toHaveAttribute('readonly')
    const params = new URL(state.request.mock.calls[0][0], 'https://console.example').searchParams
    expect([...new Set(params.keys())]).toEqual(['keys'])
    expect(params.getAll('keys').length).toBeLessThanOrEqual(24)
    expect(state.request.mock.calls.flatMap(([path]) => new URL(path, 'https://console.example').searchParams.getAll('keys'))).toEqual(fieldReferences.map(field => field.key))
  })

  it('keeps the read page available while denied write controls and inputs remain disabled', async () => {
    state.authorization = {...state.authorization!, snapshot: {...state.authorization!.snapshot, permissionCodes: ['TIANSHU_READ']}}
    show()
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(Math.ceil(fieldReferences.length / 24)))
    expect(screen.getByText('application table')).toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'save application'})).toBeDisabled()
    expect(screen.getByLabelText('application name')).toHaveAttribute('readonly')
  })

  it.each(['missing', 'readOnly', 'wrongVersion', 'wrongTenant'])('fails closed for a %s field catalog', async reason => {
    const result = catalog()
    if (reason === 'missing') delete (result.fields as Record<string, unknown>)['tianshu.field.DdcAppBO.appName']
    if (reason === 'readOnly') (result.fields as Record<string, unknown>)['tianshu.field.DdcAppBO.appName'] = {access: 'PUBLIC', inputBinding: false}
    const response = reason === 'wrongVersion' ? {...result, catalogVersion: '8'} : reason === 'wrongTenant'
      ? {...result, catalogScope: {...result.catalogScope, tenantId: '2002'}} : result
    state.request.mockImplementation(async (path: string) => responseFor(path, response))
    show()
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(Math.ceil(fieldReferences.length / 24)))
    expect(screen.getByRole('button', {name: 'save application'})).toBeDisabled()
    expect(screen.getByLabelText('application name')).toHaveAttribute('readonly')
  })

  it('does not reuse a view whose active role or authorization version no longer matches', async () => {
    const view = show()
    await waitFor(() => expect(screen.getByRole('button', {name: 'save application'})).toBeEnabled())
    state.authorization = {...state.authorization!, binding: {...state.authorization!.binding, authVersion: '4',
      activeRoleContext: {...state.authorization!.binding.activeRoleContext, effectiveRoleIds: ['12']}}}
    view.rerenderBinding()
    expect(screen.queryByText('application table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'save application'})).toBeDisabled()
    expect(screen.getByLabelText('application name')).toHaveAttribute('readonly')
  })

  it('expires retained controls without waiting for a new request', async () => {
    vi.useFakeTimers({shouldAdvanceTime: true})
    state.authorization = {...state.authorization!, snapshot: {...state.authorization!.snapshot, snapshotExpiresAt: new Date(Date.now() + 60_000).toISOString()}}
    show()
    await waitFor(() => expect(screen.getByRole('button', {name: 'save application'})).toBeEnabled())
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001) })
    expect(screen.queryByText('application table')).not.toBeInTheDocument()
    expect(screen.getByRole('button', {name: 'save application'})).toBeDisabled()
    expect(screen.getByLabelText('application name')).toHaveAttribute('readonly')
  })

  it('does not fetch protected field metadata without a current identity view', () => {
    state.authorization = undefined
    show()
    expect(state.request).not.toHaveBeenCalled()
    expect(screen.getByRole('button', {name: 'save application'})).toBeDisabled()
  })
})

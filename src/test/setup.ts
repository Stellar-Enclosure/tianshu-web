import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'
import {vi} from 'vitest'
import {createElement} from 'react'
import {Button} from 'antd'
import type {ReactNode} from 'react'
import {fixtureT} from './i18nFixture'

vi.mock('../i18n/AdminI18nProvider', async (importOriginal) => ({
  ...await importOriginal<typeof import('../i18n/AdminI18nProvider')>(),
  AdminI18nProvider: ({children}: {children: ReactNode}) => children,
  PageLanguageBoundary: ({children}: {children: ReactNode}) => children,
  usePageMessages: (pageCode: string) => ({t: fixtureT(pageCode), locale: 'zh-CN', loading: false,
    error: null, refresh: vi.fn(), messages: {}}),
  useAdminI18n: () => ({locale: 'zh-CN', changing: false, changeLocale: vi.fn(), refresh: vi.fn(),
    bootstrap: {scope: {bizCode: 'xingyuan', namespaceCode: 'default', env: 'local', appCode: 'tianshu'},
      defaultLocale: 'zh-CN', locales: ['zh-CN', 'en-US'], pages: [], canInitialize: false}}),
}))

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
}

if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}

// Existing page tests isolate UI behavior; authority tests explicitly unmock these shared boundaries.
vi.mock('../permissions/access', () => ({
  useDdcPermission: () => true,
  RequirePermission: ({children}: {children: ReactNode}) => children,
  PermissionButton: ({resourceKey, ...props}: import('antd').ButtonProps & {resourceKey: string}) => createElement(Button, {...props, 'data-resource-key': resourceKey}),
}))
vi.mock('../permissions/FieldCatalog', () => ({useDdcWritable: () => true,
  FieldCatalogProvider: ({children}: {children: ReactNode}) => children}))

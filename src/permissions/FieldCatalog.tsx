import {usePermission} from '@stellar-enclosure/stellar-enclosure-web-shared/react-permissions'
import {createContext, useContext, type ReactNode} from 'react'
import {useQuery} from '@tanstack/react-query'
import {evaluateFieldAccess, loadFieldCatalog, type BackendFieldCatalog} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import {ddcApi} from '../api/client'
import {useAuth} from '../auth/AuthContext'
import {fieldReferences, inputFields} from './fieldReferences'

const CatalogContext = createContext<BackendFieldCatalog | null>(null)

export function FieldCatalogProvider({children}: {children: ReactNode}) {
  const {authorization} = useAuth()
  const query = useQuery({
    queryKey: ['tianshu-field-catalog', authorization?.binding],
    queryFn: ({signal}) => loadFieldCatalog(fieldReferences.map(reference => reference.key), query =>
      ddcApi<BackendFieldCatalog>(`/api/v1/authorization/field-catalog?${query}`, {signal})),
    enabled: !!authorization,
    staleTime: 30_000,
  })
  return <CatalogContext.Provider value={authorization && !query.error ? query.data ?? null : null}>{children}</CatalogContext.Provider>
}

/** Full-replacement forms remain read-only unless every field they submit is a real writable input. */
export function useDdcWritable(dto: keyof typeof inputFields): boolean {
  const catalog = useContext(CatalogContext)
  const {authorization} = useAuth()
  const permission = usePermission(authorization?.snapshot ?? null, authorization?.binding ?? null)
  return permission.allows({access: 'PUBLIC'}) && inputFields[dto].every(key => evaluateFieldAccess(key, catalog, authorization?.snapshot ?? null,
    authorization?.binding ?? null).writable)
}

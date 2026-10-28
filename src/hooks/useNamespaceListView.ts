import {useQuery} from '@tanstack/react-query'
import {loadNamespaceListView} from '../api/listTemplates'
import {useAuth} from '../auth/AuthContext'
import {useDdcPermission} from '../permissions/access'
import {useDdcWritable} from '../permissions/FieldCatalog'

export function useNamespaceListView() {
  const {authorization} = useAuth()
  const templateWritable = useDdcWritable('DdcListTemplateCommand')
  const selectionWritable = useDdcWritable('DdcListSelectionCommand')
  const exportWritable = useDdcWritable('DdcNamespaceExportCommand')
  const maySystem = useDdcPermission('tianshu.button.NamespacesPage.templateSystem') && templateWritable
  const mayPersonal = useDdcPermission('tianshu.button.NamespacesPage.templatePersonal') && templateWritable
  const mayExport = useDdcPermission('tianshu.button.NamespacesPage.export') && exportWritable
  const catalogVersion = authorization?.snapshot.catalogVersion
  const query = useQuery({
    queryKey: ['namespace-list-view', authorization?.binding, catalogVersion],
    queryFn: ({signal}) => loadNamespaceListView(catalogVersion!, false, signal),
    enabled: !!authorization && !!catalogVersion,
  })
  const management = useQuery({
    queryKey: ['namespace-list-view-management', authorization?.binding, catalogVersion],
    queryFn: ({signal}) => loadNamespaceListView(catalogVersion!, true, signal),
    enabled: !!authorization && !!catalogVersion && maySystem,
  })
  return {view: query.data, error: query.error, loading: query.isPending, managementView: management.data,
    managementError: management.error, maySystem, mayPersonal, mayExport, selectionWritable}
}

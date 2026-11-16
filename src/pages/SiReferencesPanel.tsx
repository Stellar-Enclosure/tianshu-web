import { defineMessages } from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Card, Col, Row, Table, Tag } from 'antd'
import { ddcSiQueryKeys, listSiVersionReferences } from '../api/si'
import type { SiReferenceItem } from '../api/types'
import { usePageMessages } from '../i18n/AdminI18nProvider'
import { formatAdminError } from '../i18n/errors'

export const siReferencesMessages = defineMessages([
  { pageCode: 'tianshu.si', key: 'si.references.title', defaultLocale: 'zh-CN', defaults: { 'zh-CN': '依赖拓扑与影响面', 'en-US': 'Dependency graph & impact' } },
])

type Props = {
  resourceId: number
  versionNo: number
}

export default function SiReferencesPanel({ resourceId, versionNo }: Props) {
  const { t } = usePageMessages('tianshu.si')

  const outbound = useQuery({
    queryKey: ddcSiQueryKeys.references(resourceId, versionNo, 'OUTBOUND'),
    queryFn: ({ signal }) => listSiVersionReferences(resourceId, versionNo, 'OUTBOUND', { signal }),
  })

  const inbound = useQuery({
    queryKey: ddcSiQueryKeys.references(resourceId, versionNo, 'INBOUND'),
    queryFn: ({ signal }) => listSiVersionReferences(resourceId, versionNo, 'INBOUND', { signal }),
  })

  const columns = [
    {
      title: t('si.references.sourceCol'),
      key: 'source',
      render: (_: unknown, row: SiReferenceItem) => (
        <span>
          <Tag>{row.sourceType}</Tag> {row.sourceKey}
        </span>
      ),
    },
    {
      title: t('si.references.targetCol'),
      key: 'target',
      render: (_: unknown, row: SiReferenceItem) => (
        <span>
          <Tag color="blue">{row.targetType}</Tag> {row.targetKey}
        </span>
      ),
    },
    {
      title: t('si.references.requiredCol'),
      dataIndex: 'required',
      key: 'required',
      render: (req: boolean) => (req ? <Tag color="green">{t('common.yes')}</Tag> : <Tag>{t('common.no')}</Tag>),
    },
  ]

  if (outbound.isError || inbound.isError) {
    return (
      <Alert
        type="error"
        title={formatAdminError(outbound.error ?? inbound.error, t)}
        action={
          <Button
            size="small"
            onClick={() => {
              void outbound.refetch()
              void inbound.refetch()
            }}
          >
            {t('common.retry')}
          </Button>
        }
      />
    )
  }

  return (
    <Card size="small" title={t('si.references.title')}>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card size="small" title={t('si.references.outboundTitle')}>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={outbound.data ?? []}
              columns={columns}
              loading={outbound.isLoading}
              locale={{ emptyText: t('common.empty') }}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title={t('si.references.inboundTitle')}>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={inbound.data ?? []}
              columns={columns}
              loading={inbound.isLoading}
              locale={{ emptyText: t('common.empty') }}
            />
          </Card>
        </Col>
      </Row>
    </Card>
  )
}

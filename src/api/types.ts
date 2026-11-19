export type ResultEnvelope = {
  success: boolean
  code: number
  status: string
  message: string
  traceId?: string
  timestamp: number
}

export type AuthorizationBootstrap = {
    user: {
        id: string
        tenantId: string
        identitySub: string
        status: string
    }
    activeRoleContexts: readonly unknown[]
    permissions: readonly string[]
    apps: readonly unknown[]
    menus: readonly unknown[]
    routes: readonly unknown[]
    actions: readonly unknown[]
    fieldPolicies: Readonly<Record<string, unknown>>
    defaultApplicationCode: string | null
    defaultRoute: string | null
    authVersion: number
    policyVersion: number
}

export type ResultRecord<T> = ResultEnvelope & { data: T }

export type PageMetaRecord = {
  total: number
  pageNo: number
  pageSize: number
  pages: number
  hasNext: boolean
  hasPrevious: boolean
}

export type PageResultRecord<T> = ResultEnvelope & {
  records: T[]
  page: PageMetaRecord
}

export type RegistryService = {
  bizCode: string
  env: string
  appCode: string
  serviceId: string
  serviceKind: string
  protocol: string
  serviceName: string
  group?: string
  version?: string
  metadata?: Record<string, unknown>
}

export type RegistryInstance = {
  instanceId: string
  leaseId?: string
  host: string
  port: number
  secure: boolean
  status: string
  registeredAt?: string
  lastHeartbeatAt?: string
  expireAt?: string
  metadata?: { buildId?: string }
}

export type DdcConfig = {
  id: string
  bizCode: string
  appCode: string
  env: string
  visibleNamespaces: string[]
  resourceName: 'application.yml' | 'application.yaml'
  content: string
  format: 'YAML'
  currentVersion: number
  description?: string
  createdAt?: string
  updatedAt?: string
}

export type DdcPublishResult = {
  changeId: string
  status: string
  targetCount?: number
  ackCount?: number
  failedCount?: number
  ignoredCount?: number
  timeoutCount?: number
  attemptCount?: number
  targetVersion?: number
  resourceChecksum?: string
  errorMessage?: string
}

export type DdcConfigVersion = {
  id: string
  configId: string
  version: number
  resourceName: 'application.yml' | 'application.yaml'
  oldContent?: string
  newContent?: string
  format: 'YAML'
  changeType?: string
  changeReason?: string
  operator?: string
  createdAt?: string
}

export type DdcBiz = {
  id: string
  bizCode: string
  bizName: string
  description?: string
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export type DdcEnv = {
  id: string
  envCode: string
  description?: string
  sortOrder: number
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export type DdcApp = {
  id: string
  appCode: string
  bizCode: string
  appName: string
  owner?: string
  description?: string
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export type DdcNamespace = {
  id: string
  bizCode: string
  namespaceCode: string
  namespace: string
  description?: string
  enabled: boolean
  createdAt?: string
  updatedAt?: string
}

export type DdcPublishTask = {
  id: string
  changeId: string
  configId?: string
  bizCode?: string
  appCode?: string
  env?: string
  resourceName?: string
  targetVersion?: number
  publishMode?: string
  resourceChecksum?: string
  attemptCount?: number
  dispatchedAt?: string
  completedAt?: string
  failureStage?: string
  status: string
  targetCount?: number
  ackCount?: number
  failedCount?: number
  ignoredCount?: number
  timeoutCount?: number
  timeoutMs?: number
  operator?: string
  errorMessage?: string
  createdAt?: string
  updatedAt?: string
}

export type DdcWorkloadObservationStatus =
  | 'INITIALIZING'
  | 'RELISTING'
  | 'FRESH'
  | 'STALE'
  | 'UNAVAILABLE'
  | 'IDENTITY_CONFLICT'
  | 'CLOSED'
  | 'UNKNOWN'

export type DdcWorkloadObservation = {
  targetBindingId: string
  clusterId: string
  k8sNamespace: string
  workloadUid: string
  status: DdcWorkloadObservationStatus
  reasonCode?: string | null
  observedAt?: string | null
  validUntil?: string | null
  desiredReplicas?: number | null
  pods?: {
    podUid: string
    podName: string
    containerName: string
    ready: boolean
    restartCount: number
  }[]
}

export type DdcCapabilityState =
  | 'READY'
  | 'NOT_CONFIGURED'
  | 'FORBIDDEN'
  | 'UNAVAILABLE'

export type DdcCapabilityView = {
  state: DdcCapabilityState
  message: string
  traceId?: string
}

export type DdcCacheCheckRow = {
  resourceName: string
  databaseValue?: string
  redisValue?: string
  databaseVersion?: number
  redisVersion?: number
  matched: boolean
}

export type DdcNamespaceEnvAppBinding = {
  id: string
  bizCode: string
  namespaceId: string
  namespaceCode: string
  env: string
  appId: string
  appCode: string
  appName: string
  enabled: boolean
}

export type DdcNamespaceEnvAppBindingRequest = {
  bizCode: string
  namespaceCode: string
  env: string
  appCode: string
  enabled: boolean
}

export type DdcAiKind = 'PROMPT' | 'SKILL'

export type DdcAiNodeType = 'DIRECTORY' | 'FILE'

export type DdcAiScope = {
  bizCode: string
  namespaceCode: string
  env: string
  appCode: string
}

export type DdcAiNode = {
  path: string
  nodeType: DdcAiNodeType
  content: string | null
}

export type DdcAiContent = {
  promptText: string | null
  nodes: DdcAiNode[]
}

export type DdcAiResourceSummary = {
  id: string
  scope: DdcAiScope
  kind: DdcAiKind
  resourceKey: string
  displayName: string
  description: string
  revision: string
  lastVersionNo: string
  currentVersionId: string | null
  currentVersionNo: string | null
  updatedAt: string
}

export type DdcAiResourceResult = {
  resource: DdcAiResourceSummary
  draft: DdcAiContent
}

export type DdcAiVersionSummary = {
  id: string
  resourceId: string
  versionNo: string
  kind: DdcAiKind
  displayName: string
  description: string
  contentSha256: string
  contentBytes: number
  nodeCount: number
  sourceVersionId: string | null
  changeNote: string
  createdAt: string
  createdBy: string
}

export type DdcAiVersionResult = {
  version: DdcAiVersionSummary
  content: DdcAiContent
}

export type DdcAiPublicationResult = {
  id: string
  resourceId: string
  operation: 'PUBLISH' | 'ROLLBACK' | 'PROMOTE'
  previousVersionId: string | null
  targetVersionId: string
  targetVersionNo: string
  sourceVersionId: string | null
  resourceRevision: string
  targetCreated: boolean
  createdAt: string
}

export type DdcAiCreateCommand = {
  scope: DdcAiScope
  kind: DdcAiKind
  resourceKey: string
  displayName: string
  description: string
  draft: DdcAiContent
}

export type DdcAiDraftCommand = {
  expectedRevision: string
  displayName: string
  description: string
  draft: DdcAiContent
}

export type DdcAiPublishCommand = {
  expectedRevision: string
  changeNote: string
}

export type DdcAiRollbackCommand = {
  expectedRevision: string
  versionNo: string
  changeNote: string
}

export type DdcAiPromotionCommand = {
  sourceVersionNo: string
  targetScope: DdcAiScope
  targetResourceKey: string
  expectedTargetRevision: string | null
  changeNote: string
}

export type DdcAiResourcePageParams = DdcAiScope & {
  kind: DdcAiKind
  resourceKeyPrefix?: string
  pageNo?: number
  pageSize?: number
}

export type DdcAiVersionPageParams = {
  pageNo?: number
  pageSize?: number
}

export type DdcAiPublicationPageParams = DdcAiVersionPageParams & {
  requestId?: string
}

export type DdcAiPolicyState = 'ARMED' | 'AWAITING_PUBLISH' | 'CONVERGED' | 'EXHAUSTED' | 'PAUSED'

export type DdcAiRunState = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED'

export type DdcAiRunTrigger = 'SCHEDULED' | 'MANUAL'

export type DdcAiRunErrorCode =
  | 'MODEL_AUTH'
  | 'MODEL_TIMEOUT'
  | 'MODEL_ERROR'
  | 'MODEL_RATE_LIMITED'
  | 'INVALID_OUTPUT'
  | 'BASE_CHANGED'
  | 'DRAFT_DIRTY'
  | 'PUBLISH_CONFLICT'
  | 'LEASE_EXPIRED'
  | 'NOT_PUBLISHED'

export type DdcAiOutcome = 'SUCCESS' | 'FAILURE' | 'UNKNOWN'

export type DdcAiScoreSource = 'EXPLICIT' | 'JUDGE' | 'NONE'

export type DdcAiJudgeState = 'NOT_REQUIRED' | 'PENDING' | 'JUDGING' | 'DONE' | 'FAILED'

export type DdcAiOptimizationEvaluation = {
  evaluatedAt: string | null
  versionId: string | null
  versionNo: string | null
  sampleCount: number | null
  averageScore: string | null
  pendingJudgeCount: number | null
}

export type DdcAiOptimizationPolicyFields = {
  enabled: boolean
  scoreThreshold: number
  minSamples: number
  /** ISO-8601 duration, e.g. PT24H. */
  evaluationWindow: string
  maxIterations: number
  /** ISO-8601 duration, e.g. PT1H. */
  cooldown: string
  autoPublish: boolean
  judgeEnabled: boolean
  optimizerModelAlias: string
  judgeModelAlias: string
  optimizerInstruction: string
}

export type DdcAiOptimizationPolicyResult = DdcAiOptimizationPolicyFields & {
  resourceId: string
  persisted: boolean
  revision: string
  state: DdcAiPolicyState
  iterationsDone: number
  consecutiveFailures: number
  activeRunId: string | null
  convergedAt: string | null
  evaluation: DdcAiOptimizationEvaluation | null
}

export type DdcAiOptimizationPolicyCommand = DdcAiOptimizationPolicyFields & {
  expectedRevision: string
  rearm: boolean
}

export type DdcAiOptimizationTriggerCommand = {
  note: string
}

export type DdcAiOptimizationRunResult = {
  id: string
  resourceId: string
  policyId: string
  runNo: string
  iterationNo: number
  trigger: DdcAiRunTrigger
  state: DdcAiRunState
  baseVersionId: string
  baseVersionNo: string | null
  sampleCount: number
  averageScore: string | null
  thresholdSnapshot: number
  windowStart: string
  windowEnd: string
  modelAlias: string
  promptTokens: number | null
  completionTokens: number | null
  producedVersionId: string | null
  producedVersionNo: string | null
  publicationId: string | null
  autoPublished: boolean
  errorCode: DdcAiRunErrorCode | null
  errorMessage: string | null
  requestId: string | null
  note: string
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  createdBy: string
}

export type DdcAiUsageFeedbackResult = {
  id: string
  resourceId: string
  versionId: string
  versionNo: string | null
  usageId: string
  reporterCredentialId: string
  bizCode: string
  env: string
  appCode: string
  outcome: DdcAiOutcome
  explicitScore: number | null
  judgeScore: number | null
  effectiveScore: number | null
  scoreSource: DdcAiScoreSource
  judgeState: DdcAiJudgeState
  judgeAttempts: number
  judgeError: string | null
  inputExcerpt: string | null
  outputExcerpt: string | null
  latencyMs: number | null
  occurredAt: string
  traceId: string | null
  judgedAt: string | null
  createdAt: string
}

export type DdcAiOptimizationRunPageParams = {
  state?: DdcAiRunState
  pageNo?: number
  pageSize?: number
}

export type DdcAiUsageFeedbackPageParams = {
  versionNo?: string
  outcome?: DdcAiOutcome
  scoreSource?: DdcAiScoreSource
  maxScore?: number
  pageNo?: number
  pageSize?: number
}

export type SiResourceKind = 'AGENT' | 'MCP' | 'PROMPT' | 'SKILL'
export type SiLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'DEPRECATED' | 'ARCHIVED'
export type SiBindingStatus = 'ACTIVE' | 'INACTIVE'
export type SiSourceType = 'CONSOLE' | 'AUTO_REPORTED' | 'GITOPS'

export type SiResourceItem = {
  id: number
  bizCode: string
  namespaceId: number
  namespaceCode?: string
  envCode: string
  appCode: string
  kind: SiResourceKind
  resourceKey: string
  displayName: string
  description?: string
  tags?: string[]
  lifecycleStatus: SiLifecycleStatus
  sourceType: SiSourceType
  specJson?: string
  contentSha256?: string
  lastVersionNo?: number
  currentVersionId?: number | null
  currentVersionNo?: number | null
  version: number
  publishedTime?: string | null
  createTime?: string
  updateTime?: string
}

export type SiVersionItem = {
  id: number
  resourceId: number
  versionNo: number
  kind: SiResourceKind
  envCode: string
  specJson?: string
  digestSha256: string
  sourceEnvCode?: string | null
  sourceVersionNo?: number | null
  changeNote?: string
  indexStatus?: string
  createUserId?: string
  publishedTime?: string | null
  indexedTime?: string | null
}

export type SiBindingItem = {
  id: number
  bizCode: string
  namespaceId: number
  envCode: string
  appCode: string
  kind: SiResourceKind
  resourceId: number
  resourceKey: string
  pinnedVersionNo?: number | null
  status: SiBindingStatus
  boundTime?: string
}

export type SiReferenceItem = {
  id: number
  sourceResourceId?: number
  sourceVersionNo?: number
  sourceType: string
  sourceKey: string
  targetType: string
  targetKind?: SiResourceKind
  targetKey: string
  pinnedVersionNo?: number | null
  envCode: string
  required: boolean
  roleHint?: string | null
}

export type SiResourceDescriptor = {
  tenantId: number
  bizCode: string
  namespaceCode: string
  envCode: string
  resourceId: number
  kind: SiResourceKind
  resourceKey: string
  displayName: string
  description?: string
  status: SiLifecycleStatus
  sourceType: SiSourceType
  activeVersionNo?: number | null
  digestSha256?: string
  labels?: Record<string, string>
  publishedAt?: string | null
  updatedAt?: string | null
}

export type SiSearchHit = {
  resource: SiResourceDescriptor
  hybridScore: number
  vectorScore: number
  ftsScore: number
  matchedChunkText?: string | null
  degradedToFtsOnly: boolean
  rank: number
}

export type SiSemanticSearchResult = {
  degradedToFtsOnly: boolean
  totalHits: number
  hits: SiSearchHit[]
}

export type SiEnvMatrixItem = {
  versionId: number
  resourceId: number
  envCode: string
  activeVersionNo: number
  digestSha256: string
  sourceEnvCode?: string | null
  sourceVersionNo?: number | null
  indexStatus?: string
  published: boolean
  publishedTime?: string | null
}

export type SiSearchParams = {
  bizCode?: string
  namespaceCode?: string
  envCode?: string
  appCode?: string
  kind?: SiResourceKind
  lifecycleStatus?: SiLifecycleStatus
  keyword?: string
  tag?: string
  pageNo?: number
  pageSize?: number
}

export type SiCreateCommand = {
  bizCode: string
  namespaceCode: string
  envCode: string
  appCode: string
  kind: SiResourceKind
  resourceKey: string
  displayName: string
  description?: string
  tags?: string[]
  sourceType?: SiSourceType
  specJson: string
}

export type SiDraftCommand = {
  expectedVersion: number
  displayName: string
  description?: string
  tags?: string[]
  specJson: string
}

export type SiLifecycleCommand = {
  expectedVersion?: number
  targetVersionNo?: number
  targetEnvCode?: string
  action?: 'DEPRECATE'
  changeNote?: string
}

export type SiBindingCommand = {
  bizCode: string
  namespaceCode: string
  envCode: string
  appCode: string
  kind: SiResourceKind
  resourceKey: string
  pinnedVersionNo?: number | null
}

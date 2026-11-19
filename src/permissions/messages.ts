import {defineMessages} from '@stellar-enclosure/stellar-enclosure-web-shared/permissions'

export const metadataMessages = defineMessages([
  {
    "pageCode": "tianshu.metadata",
    "key": "catalog.scopeId",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "目录范围 ID",
      "en-US": "Catalog scope ID"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "catalog.version",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "目录激活版本",
      "en-US": "Catalog activation version"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.title",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "资源与权限目录",
      "en-US": "Resource and permission catalog"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.description",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "只读查看代码声明、权限组合、字段策略与来源版本。",
      "en-US": "Read code declarations, permission combinations, field policies and source versions."
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.key",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "稳定键",
      "en-US": "Stable key"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.type",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "资源类型",
      "en-US": "Resource type"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.kind",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "元数据类型",
      "en-US": "Metadata kind"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.lifecycle",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "生命周期",
      "en-US": "Lifecycle"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.producer",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "生产者",
      "en-US": "Producer"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.permissions",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "权限代码",
      "en-US": "Permission codes"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.label",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "文案引用",
      "en-US": "Message reference"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.search",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "查询",
      "en-US": "Search"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.sourceVersion",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "来源版本",
      "en-US": "Source version"
    }
  },
  {
    "pageCode": "tianshu.metadata",
    "key": "metadata.policy",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "目标与权限策略",
      "en-US": "Target and permission policy"
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.load",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "加载代码源文案",
      "en-US": "Load source messages"
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.review",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "源文案核对",
      "en-US": "Review source"
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.reviewKey",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "确认已核对 {{key}}",
      "en-US": "Confirm source review: {{key}}"
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.default",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "源默认文案",
      "en-US": "Source default"
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.published",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "已发布覆盖",
      "en-US": "Published override"
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.version",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "当前目录激活版本：{{version}}",
      "en-US": "Current catalog activation: {{version}}"
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.reviewRequired",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "请逐项核对当前源文案后再保存。",
      "en-US": "Review each current source message before saving."
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.publishUncertain",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "发布结果尚未确认，请查询这次发布的结果。",
      "en-US": "Publication outcome is not confirmed. Check this operation."
    }
  },
  {
    "pageCode": "tianshu.i18n",
    "key": "source.checkPublication",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "查询发布结果",
      "en-US": "Check publication"
    }
  },
  {
    "pageCode": "common",
    "key": "nav.resourceMetadata",
    "defaultLocale": "zh-CN",
    "defaults": {
      "zh-CN": "资源权限目录",
      "en-US": "Resource catalog"
    }
  },
  {"pageCode": "tianshu.i18n", "key": "source.retryPublication", "defaultLocale": "zh-CN", "defaults": {"zh-CN": "重试同一次发布", "en-US": "Retry the same publication"}}
] as const)

export const cloudDeliveryMessages = defineMessages([
  {pageCode: 'tianshu.auth', key: 'auth.openStandalone', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '独立打开', 'en-US': 'Open standalone'}},
  {pageCode: 'tianshu.auth', key: 'auth.callbackPending', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '正在验证授权', 'en-US': 'Verifying authorization'}},
  {pageCode: 'tianshu.auth', key: 'auth.callbackDone', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '授权已返回', 'en-US': 'Authorization returned'}},
  {pageCode: 'tianshu.auth', key: 'auth.callbackFailed', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '登录失败', 'en-US': 'Sign-in failed'}},
  {pageCode: 'tianshu.auth', key: 'auth.callbackBack', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '返回控制台', 'en-US': 'Back to console'}},
  {pageCode: 'common', key: 'shell.ssoLogout', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '统一退出（SSO）', 'en-US': 'Sign out of SSO'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.title', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '当前配置实绩', 'en-US': 'Current configuration delivery'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.target', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '目标版本', 'en-US': 'Target revision'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.platform', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '平台应用', 'en-US': 'Platform apply'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.rollout', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '工作负载滚动', 'en-US': 'Workload rollout'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.process', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '进程回执', 'en-US': 'Process receipts'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.counts', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '期望 / 当前 / 已生效 / 失败 / 等待', 'en-US': 'Desired / current / applied / failed / waiting'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.observed', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '观测时间', 'en-US': 'Observed at'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.unknown', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '未知', 'en-US': 'Unknown'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.expired', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '观测已过期', 'en-US': 'Observation expired'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.history', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '历史任务', 'en-US': 'Historical task'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.waiting', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '已发布，等待副本', 'en-US': 'Published, waiting for replicas'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.partial', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '部分失败', 'en-US': 'Partial failure'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.receipt', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '最后回执时间', 'en-US': 'Last receipt'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.applied', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '生效版本', 'en-US': 'Applied revision'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.pod', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': 'Pod / 容器', 'en-US': 'Pod / container'}},
  {pageCode: 'tianshu.publishTasks', key: 'evidence.state', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '状态', 'en-US': 'State'}},
  {pageCode: 'tianshu.registry', key: 'observation.source', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': 'Kubernetes Service 与 EndpointSlice', 'en-US': 'Kubernetes Services and EndpointSlices'}},
  {pageCode: 'tianshu.registry', key: 'observation.ready', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '就绪', 'en-US': 'Ready'}},
  {pageCode: 'tianshu.registry', key: 'observation.serving', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '提供服务', 'en-US': 'Serving'}},
  {pageCode: 'tianshu.registry', key: 'observation.terminating', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '终止中', 'en-US': 'Terminating'}},
  {pageCode: 'tianshu.registry', key: 'observation.yes', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '是', 'en-US': 'Yes'}},
  {pageCode: 'tianshu.registry', key: 'observation.no', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '否', 'en-US': 'No'}},
  {pageCode: 'tianshu.registry', key: 'observation.stale', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '观测已过期', 'en-US': 'Observation expired'}},
  {pageCode: 'tianshu.registry', key: 'observation.condition', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '端点条件', 'en-US': 'Condition'}},
  {pageCode: 'tianshu.registry', key: 'observation.port', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '目标端口', 'en-US': 'Target port'}},
  {pageCode: 'tianshu.registry', key: 'observation.observed', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '观测时间', 'en-US': 'Observed at'}},
  {pageCode: 'tianshu.registry', key: 'observation.validUntil', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '有效至', 'en-US': 'Valid until'}},
  {pageCode: 'tianshu.registry', key: 'observation.unavailable', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '当前 Kubernetes 观测未知', 'en-US': 'Current Kubernetes observation is unavailable'}},
  {pageCode: 'tianshu.registry', key: 'observation.denied', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '无权读取 Kubernetes 观测', 'en-US': 'You do not have permission to read Kubernetes observations'}},
  {pageCode: 'tianshu.si', key: 'si.editor.draftFingerprint', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '草稿能力指纹', 'en-US': 'Draft capability fingerprint'}},
  {pageCode: 'tianshu.si', key: 'si.editor.publishedFingerprint', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '已发布能力指纹', 'en-US': 'Published capability fingerprint'}},
  {pageCode: 'tianshu.si', key: 'si.editor.fingerprintChanged', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '能力指纹已变化。', 'en-US': 'The capability fingerprint changed.'}},
  {pageCode: 'tianshu.configs', key: 'preview.action', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '预览发布', 'en-US': 'Preview publication'}},
  {pageCode: 'tianshu.configs', key: 'preview.title', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '配置发布预览', 'en-US': 'Configuration publication preview'}},
  {pageCode: 'tianshu.configs', key: 'preview.rollout', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '本次变更需要重新部署工作负载。', 'en-US': 'This change requires a workload rollout.'}},
  {pageCode: 'tianshu.configs', key: 'preview.noRollout', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '本次变更无需重新部署工作负载。', 'en-US': 'This change requires no workload rollout.'}},
  {pageCode: 'tianshu.configs', key: 'preview.unknown', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '未知或无权读取', 'en-US': 'Unknown or unavailable'}},
  {pageCode: 'tianshu.configs', key: 'preview.baseline', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '对比的已发布版本', 'en-US': 'Published baseline'}},
  {pageCode: 'tianshu.configs', key: 'preview.noBaseline', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '尚未发布', 'en-US': 'Unpublished'}},
  {pageCode: 'tianshu.configs', key: 'preview.changes', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '配置键变更', 'en-US': 'Configuration key changes'}},
  {pageCode: 'tianshu.configs', key: 'preview.secretReferences', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': 'Secret 引用', 'en-US': 'Secret references'}},
  {pageCode: 'tianshu.configs', key: 'preview.targets', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '受影响的工作负载', 'en-US': 'Affected workloads'}},
  {pageCode: 'tianshu.configs', key: 'preview.none', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '无', 'en-US': 'None'}},
  {pageCode: 'tianshu.configs', key: 'preview.added', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '新增', 'en-US': 'Added'}},
  {pageCode: 'tianshu.configs', key: 'preview.removed', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '删除', 'en-US': 'Removed'}},
  {pageCode: 'tianshu.configs', key: 'preview.updated', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '变更', 'en-US': 'Updated'}},
  {pageCode: 'tianshu.configs', key: 'preview.ruleChanged', defaultLocale: 'zh-CN',
    defaults: {'zh-CN': '规则变更', 'en-US': 'Rule changed'}},
])

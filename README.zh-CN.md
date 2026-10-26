# Tianshu Admin Web

[English](README.md) | [Tianshu 服务端](https://github.com/Stellar-Enclosure/tianshu-service/blob/main/README.zh-CN.md)

Tianshu Admin Web 是 Stellar Enclosure 动态配置中心的独立管理控制台。它通过固定 EDGE 应用入口访问 Tianshu Admin，身份与权限视图均由服务端提供。

## 功能页面

| 页面 | 当前功能 |
|---|---|
| `/registry` | 按完整作用域查询服务目录，并按需加载实例 |
| `/configs`、`/publish-tasks` | YAML 编辑、版本、发布/回滚及发布任务结果/重试 |
| `/bizs`、`/apps`、`/namespaces`、`/envs`、`/bindings` | 作用域元数据与绑定维护 |
| `/metadata/resources` | 按七类资源、权限代码、来源与版本检索只读目录，并打开对应文案引用 |
| `/metadata/i18n` | 企业元数据中心：页面/公共多语种词条编辑、保存草稿、发布及语言包渲染预览 |
| `/instances`、`/cache` | 配置客户端实例、缓存一致性检查与重建 |
| `/ai/prompts`、`/ai/skills`、`/ai/resources/:id` | Prompt/Skill 草稿与文件编辑、版本发布/回滚、跨 scope 推广、使用反馈与优化 |

路由以 [src/App.tsx](src/App.tsx) 为准，页面实现在 [src/pages](src/pages/)。可独立部署，也可通过 `VITE_BASE_PATH` 挂载到 Portal；注册租约、配置刷新与发布状态机由服务端/Starter 实现。

## 认证

控制台使用共享 SDK 的固定应用协议。默认别名为 `edge-tianshu`，身份入口是 `/apps/edge-tianshu/auth/identity`，当前权限视图来自 `/apps/edge-tianshu/api/v1/authorization/effective-permissions`。浏览器只持有 `HttpOnly` 会话 Cookie，不存储或转发 AT/RT；所有写请求使用同一应用的 CSRF 证明，业务请求不会自动重放。

`TIANSHU_READ` 决定控制台准入；49 个 APP、PAGE、MENU、BUTTON 声明覆盖现有路由、菜单及写操作，统一调用共享 guard。权限视图绑定 issuer、subject、tenant、完整目录范围、目录/授权/策略版本、活动角色与请求 epoch。过期、身份或租户变化时清空旧视图、查询缓存及迟到响应；未保存提示只保护主动离开，不能阻止安全失效。

`src/permissions/fieldReferences.ts` 声明 95 个真实后端输入字段引用。宿主 `/api/v1/authorization/field-catalog` 返回字段策略及实际 `inputBinding`，共享 `evaluateFieldAccess` 决定编辑状态。完整替换表单只有在所有提交字段可写时才启用，避免缺失字段造成业务数据被覆盖。缺失、过期、目录不匹配或只读投影均保持只读，最终权限仍由后端执行。

## 页面多语种与资源目录

资源目录只读展示 APP、MENU、PAGE、BUTTON、API、METHOD、FIELD、权限组合、字段策略、生产者和来源版本，不允许在数据库界面改写代码权限。选择业务、应用、命名空间和环境时必须同时提供目录范围 ID 与激活版本；文案引用会携带完整目标进入翻译编辑器。

编辑器先加载代码已有的源页面，对照源默认文案、草稿覆盖和已发布覆盖，逐项确认全部当前源哈希后再保存。源 key 和源默认语言不可编辑；空覆盖回退到源文案，占位符集合必须与源文案一致。保存携带草稿 revision、目录激活版本及完整 reviewedSourceHashes；冲突保留本地内容，待显式比较后重载基线。

发布使用一个固定 operationId。结果不确定时可查询该操作，或显式重试同一个操作，不自动重放、不生成替代操作。已发布预览校验返回的完整目标、租户和目录版本。管理台自身文案由共享加载器使用完整权限 binding 加载；匿名登录包只来自固定公共入口，不伪造企业身份或权限视图。

源默认文案来自服务端 Java 声明与前端 `defineMessages` 声明的编译清单。旧的“初始化默认文案”接口不能再用来创建源元数据。服务端规则见 [页面多语种使用说明](https://github.com/Stellar-Enclosure/tianshu-service/blob/main/docs/page-i18n.md)。测试词典通过明确指定的后端编译清单同步：

```bash
node scripts/sync-i18n-fixtures.mjs --manifest /path/to/tianshu/manifest-v1.json
node scripts/sync-i18n-fixtures.mjs --manifest /path/to/tianshu/manifest-v1.json --check
```

## 开发

需要 Node 24、实际安装的同批共享 SDK 包，以及锁文件指定的工具链检出和 RC 制品。不存在源码 alias 或缺失工具时绕过校验的构建路径。

```bash
npm ci
npm run typecheck
npm test
npm run lint
PAC_SDK_DIR=/path/to/pinned/web-sdk \
PAC_TOOLCHAIN_LOCK=/path/to/permission-toolchain.lock.json \
PAC_CONTRACT_ARTIFACT=/path/to/verified-contract.jar \
PAC_BUILD_ID=release-build-id npm run build
```

唯一构建入口依次执行 contract prepare、静态扫描/校验、TypeScript 与 Vite，并嵌入 `permission-build.json`、生成 `.generated/permissions/artifact-record.json`。`LOCAL_UNCOMMITTED` 只表示同批源码验证；生产交付使用 `PINNED_COMMIT`、固定提交、匹配的依赖锁与明确 buildId。

构建时必须设置 `VITE_PERMISSION_NAMESPACE`、`VITE_PERMISSION_ENVIRONMENT`，匹配宿主固定目录。`VITE_OAUTH_APP_ALIAS` 默认 `edge-tianshu`；`VITE_YUHENG_ORIGIN` 为 EDGE origin，`VITE_BASE_PATH` 为静态挂载路径。`npm run dev` 与 preview 将 `/apps` 交给 `TIANSHU_AUTH_PROXY`，默认 `http://127.0.0.1:18180`。

注册中心首次请求会携带完整四级作用域。本地作用域不是
`default / default-app / dev / default` 时，可设置以下构建时默认值：

```bash
VITE_TIANSHU_ADMIN_DEFAULT_BIZ_CODE=retail \
VITE_TIANSHU_ADMIN_DEFAULT_APP_CODE=orders \
VITE_TIANSHU_ADMIN_DEFAULT_ENV=local \
VITE_TIANSHU_ADMIN_DEFAULT_NAMESPACE=default \
npm run dev
```

`npm run e2e` 会先构建控制台，再用 `npm run preview` 在 `http://127.0.0.1:4173` 提供服务。
当前认证用例mock OIDC入口，不证明真实Edge、授权服务器、Redis会话或Tianshu Admin运行状态。

## 运行时配置

Dockerfile 使用 Node 24，仅接收经过上述门禁的 **预构建 `dist/`**；镜像内不重新构建。启动时检查 `permission-build.json` 的生产者和应用绑定。源码验证没有启动服务、容器或浏览器。

static-server 仅将固定 `/apps/<alias>/` 路径转发给固定 EDGE 上游，查询参数不能选择上游。构建时与运行时的 alias 必须相同。

| 变量 | 默认值 | 含义 |
|---|---|---|
| `PORT` | `8080` | static-server 端口 |
| `TIANSHU_EDGE_BASE_URL` | `http://edge:18180` | 固定 EDGE 上游；旧 `TIANSHU_ADMIN_API_BASE_URL` 作为配置别名保留 |
| `TIANSHU_EDGE_APP_ALIAS` | `edge-tianshu` | 固定应用路径别名 |
| `TIANSHU_ADMIN_API_DEVELOPMENT_PLAINTEXT` | `false` | 显式允许开发环境 HTTP 上游 |
| `TIANSHU_ADMIN_API_TLS_CA_PATH` | — | HTTPS 上游 CA 文件 |
| `TIANSHU_ADMIN_API_TLS_CERTIFICATE_PATH` | — | mTLS 客户端证书 |
| `TIANSHU_ADMIN_API_TLS_PRIVATE_KEY_PATH` | — | mTLS 客户端私钥 |

本仓库是私有前端应用，只交付静态制品，不发布 npm/Maven 包。真实 EDGE、身份提供方、Tianshu 数据库和浏览器端到端验收由部署环境执行；离线测试与构建不等于运行时验收。

## 作用域模型

作用域层级为 业务域（biz）→ 应用（app）→ 命名空间（ns）→ 环境（env）。
注册身份恒为 biz-ns-env-app；业务域、应用、命名空间、环境均为独立管理实体，
禁用任一实体后该作用域的新注册与配置拉取会被拒绝（`TIANSHU_SCOPE_DISABLED`）。

作用域筛选为可选下拉，选项来自后端：业务域列表来自 `/bizs`，应用列表按所选
业务域过滤，命名空间列表按所选应用过滤，环境列表来自受管实体 `/envs`；
所有下拉均支持直接输入新值。注册查询始终携带完整四级作用域，首次查询使用上述构建时默认值。

## 服务端分页

管理表格调用新增的 `/page` 接口，并读取 `PageResultRecord.records` 和
`PageResultRecord.page`。页码从 1 开始，界面支持每页 10、20 或 50 条。作用域选择器
与命名空间绑定编辑器需要完整选项集，因此有意继续使用旧有列表接口。

注册中心表格对服务标识分页，并仅在选中一个服务后按需分页加载其实例。Tianshu Starter
和 RPC 客户端仍消费完整目录与快照；Admin Web 分页不属于机器 RPC 契约。

## 配置资源契约

配置页面按 YAML 资源而不是独立键值项管理配置。创建请求固定提交
`resourceName=application.yml`、`format=YAML` 和完整的 `content`；后端也接受
`application.yaml`，列表会按响应中的实际资源名和格式展示。每个
`bizCode + env + appCode` 只能存在一份 YAML 资源，命名空间绑定只控制可见性。

该接口是破坏性新契约，不再发送或读取 `configKey`、`configValue`、`valueType`
及 `contentChecksum` 等旧字段。

## 部署

先完成上面的受管构建，再制作镜像：

```bash
docker build -t stellar-enclosure/tianshu-web .
```

`GET /healthz` 返回 `ok`。真实运行时配置固定 EDGE 上游与 TLS；前端应用只交付静态制品，不发布到 Maven Central 或 npm。

## 独立仓库发布

发布范围、前置配置与校验命令见 [仓库 README](README.md#application-delivery-no-package-publication)。

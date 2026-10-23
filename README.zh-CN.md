# Tianshu Admin Web

[English](README.md) | [Tianshu 服务端](https://github.com/Stellar-Enclosure/tianshu-service/blob/main/README.zh-CN.md)

Tianshu Admin Web 是 Stellar Enclosure 动态配置中心的独立管理控制台。它只与 Tianshu Admin
通信，不直接调用其他组件。

## 功能页面

| 页面 | 当前功能 |
|---|---|
| `/registry` | 按完整作用域查询服务目录，并按需加载实例 |
| `/configs`、`/publish-tasks` | YAML 编辑、版本、发布/回滚及发布任务结果/重试 |
| `/bizs`、`/apps`、`/namespaces`、`/envs`、`/bindings` | 作用域元数据与绑定维护 |
| `/metadata/i18n` | 企业元数据中心：页面/公共多语种词条编辑、保存草稿、发布及语言包渲染预览 |
| `/instances`、`/cache` | 配置客户端实例、缓存一致性检查与重建 |
| `/ai/prompts`、`/ai/skills`、`/ai/resources/:id` | Prompt/Skill 草稿与文件编辑、版本发布/回滚、跨 scope 推广、使用反馈与优化 |

路由以 [src/App.tsx](src/App.tsx) 为准，页面实现在 [src/pages](src/pages/)。可独立部署，也可通过 `VITE_BASE_PATH` 挂载到 Portal；注册租约、配置刷新与发布状态机由服务端/Starter 实现。

## 认证

控制台通过 `@stellar-enclosure/stellar-enclosure-web-shared` 的 `createGatewayAuthClient` 走平台统一
身份登录；登录跳转到配置的 Edge OIDC registration（默认 `/oauth2/authorization/edge-tianshu`，可通过 `VITE_OAUTH_REGISTRATION_ID` 覆盖）。Edge 在
服务端保管 OAuth Token，并给浏览器 `HttpOnly` 会话 Cookie；浏览器不会提交租户、用户名或密码，
也不会保存 AT/RT。

因此控制台不持有 Access Token，也不发送 `Authorization` 头；API 请求通过 Edge 会话与 BFF Token
Relay。身份与权限来自 `GET /api/v1/tianshu/auth/bootstrap`，只有响应授予 `TIANSHU_READ` 时
控制台才算已授权。收到 401 时清空本地 bootstrap 状态并回到登录页。

## 页面多语种管理

进入“元数据管理 → 企业元数据中心”，选择已有的业务域、命名空间、环境和应用绑定。
新建页面时设置稳定的 `pageCode`（如 `order.list`），以 `common` 创建同作用域的公共文案。
在词条表格维护 key、默认语言和其他语言；其他语言留空表示使用默认语言文案。
保存草稿后再发布，消费端只能读取发布结果。版本冲突会保留本地编辑，需要显式重新加载服务器草稿后再处理。

已发布预览调用真实语言包接口并通过共享 SDK 渲染，同时展示对应 JSON。
Tianshu 现有全部业务路由、导航、登录提示、表单、弹窗和通用组件文案已接入中心。
界面语言切换会先加载目标语言包再切换，不重建页面、不清空未保存输入。语言包使用服务端固定的
管理台作用域，不受业务列表筛选条件影响。

点击“查看管理台语言包”即可定位该作用域。业务域、应用、命名空间、环境及绑定就绪后，
“初始化默认文案”只创建并发布缺失语言包，保留所有已有页面和草稿。初始化之前由中心返回内置默认词条；
企业已发布配置优先。发布该作用域的文案后会刷新当前界面，也可使用顶部的文案刷新按钮。
登录前只读取中心公开的静态登录包，不读取任何企业数据。
管理端需要 `TIANSHU_READ`，编辑需要 `TIANSHU_WRITE`，发布需要 `TIANSHU_PUBLISH`；
这些 OAuth scopes 和对应授权能力须同时授予，Edge 的登录 scope 配置也须包含所需操作。
仅消费语言包的业务前端可使用独立的 `TIANSHU_I18N_READ`，不必授予配置管理权限。

详细接口、迁移和消费规则见服务端 [页面多语种使用说明](https://github.com/Stellar-Enclosure/tianshu-service/blob/main/docs/page-i18n.md)，
共享加载器的接入示例见 [Web SDK](https://github.com/Stellar-Enclosure/web-sdk/tree/main/packages/stellar-enclosure-web-shared)。
本地验证必须使用同次变更构建的 Web SDK；可使用下方仓库 README 中的本地消费验证流程。

默认词条唯一源位于服务端 `src/main/resources/i18n/tianshu-admin`，前端生产代码不打包业务词典。
`src/test/i18nCatalogs.json` 仅用于测试，通过 `node scripts/sync-i18n-fixtures.mjs` 同步；
同级存在服务端仓库时，可用 `node scripts/sync-i18n-fixtures.mjs --check` 检查一致性。

## 开发

```bash
npm ci
npm run typecheck
npm test -- --run
npm run lint
npm run build
```

`npm run dev` 绑定 `http://127.0.0.1:18152`（`strictPort`），把 `/oauth2`、`/bff` 和 `/login/oauth2`
OIDC 回调代理到 Edge 网关，并把 `/api` 代理到 Tianshu Admin 前的网关。上游可分别用 `TIANSHU_AUTH_PROXY` 和
`TIANSHU_ADMIN_PROXY` 覆盖；认证上游应指向 Edge。`npm run preview` 复用同一张代理表。

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

浏览器通过 static-server 的 `/api` 反向代理访问 Tianshu Admin。用
`TIANSHU_ADMIN_API_BASE_URL` 指向管理端后端：

| 变量 | 默认值 | 含义 |
|---|---|---|
| `PORT` | `8080` | static-server 的 HTTP 端口 |
| `TIANSHU_ADMIN_API_BASE_URL` | `http://tianshu-admin:18080` | `/api` 代理的 Tianshu Admin 上游 |
| `TIANSHU_ADMIN_API_DEVELOPMENT_PLAINTEXT` | `false` | 允许明文 HTTP 上游，必须显式设为 `true` |
| `TIANSHU_ADMIN_API_TLS_CA_PATH` | — | mTLS 上游的 CA 文件（`https:` 上游必填） |
| `TIANSHU_ADMIN_API_TLS_CERTIFICATE_PATH` | — | mTLS 上游的客户端证书 |
| `TIANSHU_ADMIN_API_TLS_PRIVATE_KEY_PATH` | — | mTLS 上游的客户端私钥 |

static-server 遇到 `http:` 上游且未开启明文开关时会快速失败，但随仓 `Dockerfile` 已把
`TIANSHU_ADMIN_API_DEVELOPMENT_PLAINTEXT=true` 固化进镜像供本地使用；真实 TLS 环境必须
取消或覆盖该变量。

不要把凭据写进提交的 `.env` 文件。TLS 终结与 Tianshu Admin 的授权策略属于部署职责。

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

```bash
docker build -t egon-cola/tianshu-admin-web .
docker run --rm -p 8080:8080 \
  -e TIANSHU_ADMIN_API_BASE_URL=http://tianshu-admin:18080 \
  -e TIANSHU_ADMIN_API_DEVELOPMENT_PLAINTEXT=true \
  egon-cola/tianshu-admin-web
```

健康检查：`GET /healthz` 返回 `ok`。

## 独立仓库发布

发布范围、前置配置、校验与发布命令见 [仓库 README](README.md#application-delivery-no-package-publication)。应用和测试示例不发布到 Maven Central，前端站点保持 `private: true`。

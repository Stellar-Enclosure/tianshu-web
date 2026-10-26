# tianshu-web

[English](README.md) | [中文](README.zh-CN.md)

React management console for the Tianshu service registry, configuration center and Prompt/Skill resources. All first-party modules start at **0.0.1**.

## Pages and capabilities

| Routes | Function |
|---|---|
| `/registry` | Browse registered services and load their instances within the selected scope. |
| `/configs`, `/publish-tasks` | Edit YAML resources, inspect versions, publish/roll back, inspect publication targets/results and retry tasks. |
| `/bizs`, `/apps`, `/namespaces`, `/envs`, `/bindings` | Manage scope metadata and namespace/environment/application bindings. |
| `/metadata/resources` | Read the seven resource kinds, permission definitions, source versions and immutable field policies; open their message references. |
| `/metadata/i18n` | Enterprise metadata center: edit page/shared translations, save drafts, publish, and preview rendered language bundles and JSON. |
| `/instances`, `/cache` | Inspect configuration clients, query cache consistency and request cache rebuilds. |
| `/ai/prompts`, `/ai/skills`, `/ai/resources/:id` | Edit Prompt/Skill drafts and Skill files, inspect/publish/roll back versions, promote versions across scopes, and manage feedback/optimization. |

Routes are defined in [src/App.tsx](src/App.tsx); page implementations live under [src/pages](src/pages/), with [AI API contracts](src/api/ai.ts). Management tables use backend pagination while scope selectors retain complete option lists.

The backend is [tianshu-service](https://github.com/Stellar-Enclosure/tianshu-service). Authentication uses the shared SDK and fixed Edge application alias `edge-tianshu`: `/apps/edge-tianshu/auth/identity` establishes identity, then `/apps/edge-tianshu/api/v1/authorization/effective-permissions` supplies the current permission view. OAuth tokens remain on the server. Console admission requires `TIANSHU_READ`; the existing routes, navigation and write actions each use standard resource declarations and shared guards. The SPA does not implement machine gRPC registration, configuration delivery or the Admin's publication state machine. It runs standalone or as a portal child using `VITE_BASE_PATH`; real authentication and service availability require separate runtime verification.

## Page translations

The resource catalog and translation editor require an explicit catalog scope ID and activation version, in addition to the business, application, namespace and environment. Resource metadata, permission combinations, field policies and producer/source versions are read-only. Message references open the translation editor with that exact target.

Load an existing code-owned source page, compare source defaults, draft overrides and published overrides, and review every current source hash before saving. Source keys and the source default locale cannot be changed in this console. Blank overrides fall back to source defaults. Placeholder sets must match the source message. Saving carries the exact draft revision and catalog activation version; conflicts preserve the local buffer until the operator compares and selects the new baseline.

Publication has one stable operation ID. An uncertain response exposes a read-only status query and an explicit retry of that same operation; it never generates a replacement operation or automatically replays a mutation. Published previews validate the returned complete scope, tenant and version. The administration interface uses the shared page loader with issuer, subject, tenant, catalog, authorization/policy versions, active role context and request epoch. Anonymous login text comes from the fixed public bundle without an enterprise permission view.

`src/permissions/fieldReferences.ts` references 95 actual backend input fields. The current host's `GET /api/v1/authorization/field-catalog?keys=...` returns the authoritative field policy and `inputBinding` facts. Complete-replacement forms stay read-only unless every field they submit is writable; missing, stale and read-only projections deny editing. APIs remain the enforcement boundary.

Management requires `TIANSHU_READ`, editing requires `TIANSHU_WRITE`, and publication requires `TIANSHU_PUBLISH`, together with the corresponding OAuth scope. Bundle-only consumers may use `TIANSHU_I18N_READ`. Source defaults are compiled from `tianshu-service` Java declarations and the console's `defineMessages` declarations; the old database initialization endpoint is no longer a way to create source metadata. See the [backend integration guide](https://github.com/Stellar-Enclosure/tianshu-service/blob/main/docs/page-i18n.md).

`src/test/i18nCatalogs.json` is a test fixture. Refresh or verify it using an explicitly selected compiled backend manifest:

```bash
node scripts/sync-i18n-fixtures.mjs --manifest /path/to/tianshu/manifest-v1.json
node scripts/sync-i18n-fixtures.mjs --manifest /path/to/tianshu/manifest-v1.json --check
```

## Build and test

Requires Node 24, the matching installed shared SDK package and the checked-out toolchain identified by its lock. There are no source aliases. `npm run build` executes contract preparation, static scanning and validation, TypeScript compilation and Vite through the single SDK consumer entrypoint. It embeds `permission-build.json` and creates `.generated/permissions/artifact-record.json`; a failed gate does not leave a successful artifact record.

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

The lock must match the selected RC artifact, scanner checkout and dependency lock. `LOCAL_UNCOMMITTED` is only same-batch source verification; production delivery requires `PINNED_COMMIT`, an immutable source checkout and an explicit build ID. No missing-tool fallback bypasses the gate. SDK publication and a reproducible formal dependency lock are separate release steps.

Set `VITE_PERMISSION_NAMESPACE` and `VITE_PERMISSION_ENVIRONMENT` to the deployment's fixed Tianshu catalog. Missing or mismatched bindings fail closed. `VITE_OAUTH_APP_ALIAS` defaults to `edge-tianshu`; `VITE_YUHENG_ORIGIN` is the Edge origin, and `VITE_BASE_PATH` remains the static mount path. Development/preview proxy `/apps` to `TIANSHU_AUTH_PROXY` (default `http://127.0.0.1:18180`).

## Application delivery (no package publication)

This private application is delivered as static assets. The Dockerfile consumes a **prebuilt, verified `dist/`**; it does not rebuild from source or bypass the toolchain gate. Its Node 24 runtime requires the matching Tianshu `permission-build.json`. No container, application or browser was started during source validation.

The static server forwards only `/apps/<fixed-alias>/` to `TIANSHU_EDGE_BASE_URL` (default `http://edge:18180`). `TIANSHU_EDGE_APP_ALIAS` must match the build alias. The former `TIANSHU_ADMIN_API_BASE_URL` remains an upstream-setting alias, now requiring an Edge endpoint. Existing TLS settings `TIANSHU_ADMIN_API_TLS_CA_PATH`, `TIANSHU_ADMIN_API_TLS_CERTIFICATE_PATH`, `TIANSHU_ADMIN_API_TLS_PRIVATE_KEY_PATH` are retained; HTTP requires explicit `TIANSHU_ADMIN_API_DEVELOPMENT_PLAINTEXT=true`. Do not point this browser proxy at the resource server directly.

## Compatibility and publication

Java packages/classes, Bean names, configuration keys, OAuth/RPC identities, APIs, and database ownership are retained. Existing SQL and DDL history are copied byte for byte. Artifact/build versions and necessary build paths change. A successful build does not imply application startup or live infrastructure acceptance.

Git pushes run validation only. Central and npm publication are separate user actions. CI and release consumers must provide the same pinned toolchain and contract inputs as the local build gate. Private organizations may supply the Actions secret `STELLAR_ENCLOSURE_READ_TOKEN` with repository read access.

Original MIT/LGPL licenses and author attribution are preserved.

## Permission manifest builds and controlled delivery

`npm run build` uses the explicit SDK tool checkout to prepare the digest-pinned RBAC contract, scan and validate all declared modules, typecheck, and build Vite assets. It writes a FULL manifest and artifact record under `.generated/permissions/`, and embeds matching build identifiers in `dist/permission-build.json`. A failed build removes its current success evidence. The frontend owns its APP/MENU/PAGE/COMPONENT/BUTTON declarations; API and FIELD entries reference backend definitions. Form writes require the current identity snapshot, matching field catalog, backend `inputBinding`, and the field's write expression.

For local source verification, provide absolute reviewed paths. The current `permission-toolchain.local.lock.json` has mode `LOCAL_UNCOMMITTED`; it permits offline validation and rejects online registration and distribution. `PAC_CONTRACT_ARTIFACT` must name the exact JAR whose SHA-256 is recorded by that lock. These variables contain paths and build metadata only.

```sh
export PAC_SDK_DIR=/absolute/path/to/web-sdk
export PAC_TOOLCHAIN_LOCK="$PWD/permission-toolchain.local.lock.json"
export PAC_CONTRACT_ARTIFACT=/absolute/path/to/reviewed-permission-contract.jar
npm ci --offline --ignore-scripts
npm run typecheck
npm test -- --run --testTimeout=15000
npm run build
python3 scripts/permission-ci.test.py
node "$PAC_SDK_DIR/scripts/permissions/ci.mjs" --phase validate \
  --lock "$PAC_TOOLCHAIN_LOCK" --manifest .generated/permissions/manifest-v1.json \
  --evidence .generated/permissions/artifact-record.json --artifact dist \
  --output-dir .generated/permission-ci
```

Install the same reviewed SDK tarballs into the npm cache before `npm ci --offline`; use `web-sdk/scripts/verify-consumers.mjs --phase prepare` and then `--phase verify` for the six-consumer lock/integrity check. An npm cache or an offline source build is not npm registry publication.

CI requires a real `permission-toolchain.lock.json` in `PINNED_COMMIT` mode, a clean SDK checkout at its exact commit, and a digest-matching RC artifact. No immutable toolchain pin or target account is fabricated in this working tree. Configure the non-secret `permission-targets.json` with the exact scope, producer, issuer, client and allowed service scopes before enabling delivery. Namespace/environment build settings must match the deployed authorization snapshot.

The normal GitHub/GitLab pipelines perform offline checks and package artifact evidence. Pull requests receive no registration credential. The separate protected delivery phase explicitly chooses `register` or `activate`; registration uses one stable operation ID, and pending/unknown outcomes remain exit code 6 and must be queried with that same ID. Registration does not grant roles or activate a version. Activation consumes the exact successful build plus fresh trusted deployment/readiness evidence and the complete producer selection with existing qualification IDs. The server independently rechecks scope, ownership, revisions and qualification. Keep credentials in protected owner-only files; do not place them in command arguments, manifests, reports or source.

Local unit/build evidence does not prove PostgreSQL migrations, browser/SSO behavior, deployed artifact readiness, real CI runs, or remote registration/activation. Those require the separately prepared environment. None of these commands starts an application, database, container or browser.

GitLab activation additionally requires protected `PERMISSION_DEPLOYMENT_JOB_NAME` (the exact name of a separate successful deployment job) and `PERMISSION_GITLAB_READ_TOKEN_FILE` (an absolute owner-only file containing a `read_api` token). Deployment evidence includes `gitlab: {projectId, pipelineId, jobId}` using decimal strings from the current project. The adapter reads that job and successful pipeline from the configured GitLab API, checks the current protected ref/commit and fresh readiness, and compares the original `permission-deployment.json` job artifact with the local proof. The API must share the `CI_SERVER_URL` HTTPS origin; artifact CDN redirects never receive the API token. These external variables and deployment jobs still require environment configuration and verification.

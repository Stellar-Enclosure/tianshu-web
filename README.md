# tianshu-web

[English](README.md) | [中文](README.zh-CN.md)

React management console for the Tianshu service registry, configuration center and Prompt/Skill resources. All first-party modules start at **0.0.1**.

## Pages and capabilities

| Routes | Function |
|---|---|
| `/registry` | Browse registered services and load their instances within the selected scope. |
| `/configs`, `/publish-tasks` | Edit YAML resources, inspect versions, publish/roll back, inspect publication targets/results and retry tasks. |
| `/bizs`, `/apps`, `/namespaces`, `/envs`, `/bindings` | Manage scope metadata and namespace/environment/application bindings. |
| `/metadata/i18n` | Enterprise metadata center: edit page/shared translations, save drafts, publish, and preview rendered language bundles and JSON. |
| `/instances`, `/cache` | Inspect configuration clients, query cache consistency and request cache rebuilds. |
| `/ai/prompts`, `/ai/skills`, `/ai/resources/:id` | Edit Prompt/Skill drafts and Skill files, inspect/publish/roll back versions, promote versions across scopes, and manage feedback/optimization. |

Routes are defined in [src/App.tsx](src/App.tsx); page implementations live under [src/pages](src/pages/), with [AI API contracts](src/api/ai.ts). Management tables use backend pagination while scope selectors retain complete option lists.

The backend is [tianshu-service](https://github.com/Stellar-Enclosure/tianshu-service). Authentication uses the shared SDK with Edge registration `edge-tianshu`, server-held OAuth tokens and `/api/v1/tianshu/auth/bootstrap`; console admission requires `TIANSHU_READ`. The SPA does not implement machine gRPC registration, configuration delivery or the Admin's publication state machine. It runs standalone or as a portal child using `VITE_BASE_PATH`; real authentication and service availability require separate runtime verification.

## Page translations

Create a stable page code such as `order.list`, or `common` for shared messages, within an existing bound scope.
Edit translations by key and locale, save the draft, then publish all locales together. Missing translations fall back
to the configured default language. The preview reads published data through the shared Web SDK; it never exposes draft text.
All existing Tianshu routes, navigation, authentication screens, dialogs, validation messages and component labels
now use the enterprise metadata center. The server supplies the administration scope; business filters cannot change it.
The interface language selector loads the new bundles before switching, keeping unsaved inputs intact.

In `/metadata/i18n`, choose **View administration bundles** to select the console's fixed scope.
After its business/namespace/environment/application binding exists, **Initialize default text** creates and publishes
only missing server-owned catalogs. Existing pages and drafts are preserved. Until initialization, the center serves its
packaged defaults; published tenant translations override those defaults. Publishing in this scope refreshes visible text.
The anonymous login endpoint exposes only the static `tianshu.auth` catalog and never reads tenant data.

Management requires `TIANSHU_READ`, editing requires `TIANSHU_WRITE`, and publication requires `TIANSHU_PUBLISH`,
with both the OAuth scope and corresponding capability granted. Include the required scopes in the Edge login registration.
Bundle-only consumers can use `TIANSHU_I18N_READ`. See the [backend integration guide](https://github.com/Stellar-Enclosure/tianshu-service/blob/main/docs/page-i18n.md).
Build the matching Web SDK change before verifying this console locally using the workflow below.

Default catalogs live in `tianshu-service/stellar-enclosure-tianshu-admin/src/main/resources/i18n/tianshu-admin`.
The frontend ships no production business dictionary. `src/test/i18nCatalogs.json` is a test-only fixture generated
with `node scripts/sync-i18n-fixtures.mjs`; use `--check` to verify it against the server source in a sibling checkout.

## Build and test

Requires Node 24 and npm 11. After the SDKs are published:

```bash
npm ci
npm run build
npm test -- --run
```

For the initial release before npm publication, clone `web-sdk` next to this repository:

```bash
node ../web-sdk/scripts/verify-consumers.mjs \
  --workspace "$(cd .. && pwd)" \
  --cache "$HOME/.npm" \
  --output "$(cd ../web-sdk && pwd)/dist/npm-release" \
  --consumer tianshu-web --phase verify --online true
```

The verifier uses actual pack checksums and official registry addresses in the committed lock, then validates offline installation. It never publishes packages.

## Application delivery (no package publication)

This repository is a frontend application, not a library. Its `package.json` remains `private: true`; do not publish it to npm or Maven Central. Publish only the reusable packages owned by [web-sdk](https://github.com/Stellar-Enclosure/web-sdk#publish-to-npmjs).

```bash
npm ci
npm test
npm run build
```

Deploy the resulting `dist/` directory as static application assets. Before the first SDK publication, use the Build section's local consumer verification instead of `npm ci` against the public registry. These commands do not start a server.

## Compatibility and publication

Java packages/classes, Bean names, configuration keys, OAuth/RPC identities, APIs, and database ownership are retained. Existing SQL and DDL history are copied byte for byte. Artifact/build versions and necessary build paths change. A successful build does not imply application startup or live infrastructure acceptance.

Git pushes run validation only. Central and npm publication are separate user actions. CI defaults to initial source bootstrap; after publication set `STELLAR_USE_SOURCE_BOOTSTRAP=false` to consume published artifacts directly. Private organizations may supply the Actions secret `STELLAR_ENCLOSURE_READ_TOKEN` with repository read access.

Original MIT/LGPL licenses and author attribution are preserved.

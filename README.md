# tianshu-web

[English](README.md) | [中文](README.zh-CN.md)

React management console for the Tianshu service registry, configuration center and Prompt/Skill resources. All first-party modules start at **0.0.1**.

## Pages and capabilities

| Routes | Function |
|---|---|
| `/registry` | Browse registered services and load their instances within the selected scope. |
| `/configs`, `/publish-tasks` | Edit YAML resources, inspect versions, publish/roll back, inspect publication targets/results and retry tasks. |
| `/bizs`, `/apps`, `/namespaces`, `/envs`, `/bindings` | Manage scope metadata and namespace/environment/application bindings. |
| `/instances`, `/cache` | Inspect configuration clients, query cache consistency and request cache rebuilds. |
| `/ai/prompts`, `/ai/skills`, `/ai/resources/:id` | Edit Prompt/Skill drafts and Skill files, inspect/publish/roll back versions, promote versions across scopes, and manage feedback/optimization. |

Routes are defined in [src/App.tsx](src/App.tsx); page implementations live under [src/pages](src/pages/), with [AI API contracts](src/api/ai.ts). Management tables use backend pagination while scope selectors retain complete option lists.

The backend is [tianshu-service](https://github.com/Stellar-Enclosure/tianshu-service). Authentication uses the shared SDK with Edge registration `edge-tianshu`, server-held OAuth tokens and `/api/v1/tianshu/auth/bootstrap`; console admission requires `TIANSHU_READ`. The SPA does not implement machine gRPC registration, configuration delivery or the Admin's publication state machine. It runs standalone or as a portal child using `VITE_BASE_PATH`; real authentication and service availability require separate runtime verification.

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

import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

if (!process.env.PAC_SDK_DIR) throw new Error('PAC_SDK_DIR_REQUIRED: use the tool checkout pinned by the toolchain lock')
const tool = pathToFileURL(resolve(process.env.PAC_SDK_DIR, 'scripts/permissions/build-consumer.mjs')).href
const {buildConsumer} = await import(tool)
const result = await buildConsumer()
process.stdout.write(JSON.stringify({status: result.status, mode: result.mode, buildId: result.artifact.buildId, manifestDigest: result.manifestDigest, artifactDigest: result.artifactDigest}) + '\n')

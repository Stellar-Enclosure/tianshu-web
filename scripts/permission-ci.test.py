#!/usr/bin/env python3
"""Offline tests for the repository permission delivery trust boundary."""
import datetime
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('permission_ci', Path(__file__).with_name('permission-ci.py'))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
ci = adapter


class PermissionDeliveryBoundaryTest(unittest.TestCase):
    def test_json_rejects_duplicate_members_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'input.json'
            path.write_text('{"schemaVersion":1,"schemaVersion":1}')
            with self.assertRaises(ValueError):
                adapter.read_json(path)
            path.write_text('{}')
            link = Path(temporary) / 'link.json'
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                adapter.read_json(link)

    def test_online_requires_explicit_delivery_and_protected_manual_context(self):
        for environment in [
            {},
            {'PERMISSION_DELIVERY_ENABLED': 'true', 'GITHUB_ACTIONS': 'true', 'GITHUB_REF_PROTECTED': 'false', 'GITHUB_EVENT_NAME': 'workflow_dispatch'},
            {'PERMISSION_DELIVERY_ENABLED': 'true', 'GITHUB_ACTIONS': 'true', 'GITHUB_REF_PROTECTED': 'true', 'GITHUB_EVENT_NAME': 'pull_request'},
            {'PERMISSION_DELIVERY_ENABLED': 'true', 'GITLAB_CI': 'true', 'CI_COMMIT_REF_PROTECTED': 'false', 'CI_PIPELINE_SOURCE': 'web'},
        ]:
            with self.subTest(environment=environment), patch.dict(os.environ, environment, clear=True):
                with self.assertRaises(ValueError):
                    adapter.require_delivery_boundary()
        with patch.dict(os.environ, {'PERMISSION_DELIVERY_ENABLED': 'true', 'GITHUB_ACTIONS': 'true', 'GITHUB_REF_PROTECTED': 'true', 'GITHUB_EVENT_NAME': 'workflow_dispatch'}, clear=True):
            adapter.require_delivery_boundary()

    def test_gitlab_rejects_expired_or_superseded_pipeline_without_writes(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        environment = {'PERMISSION_DELIVERY_ENABLED': 'true', 'GITLAB_CI': 'true', 'CI_COMMIT_REF_PROTECTED': 'true',
                       'CI_PIPELINE_SOURCE': 'web', 'CI_COMMIT_BRANCH': 'main', 'CI_COMMIT_SHA': 'a' * 40,
                       'CI_PIPELINE_CREATED_AT': (now - datetime.timedelta(days=2)).isoformat()}
        with patch.dict(os.environ, environment, clear=True), patch.object(adapter.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'EXPIRED'):
                adapter.require_delivery_boundary()
            run.assert_not_called()
        environment['CI_PIPELINE_CREATED_AT'] = now.isoformat()
        with patch.dict(os.environ, environment, clear=True), patch.object(adapter.subprocess, 'run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = 'b' * 40 + '\trefs/heads/main\n'
            with self.assertRaisesRegex(ValueError, 'SUPERSEDED'):
                adapter.require_delivery_boundary()
            self.assertEqual(run.call_args.args[0], ['git', 'ls-remote', '--exit-code', 'origin', 'refs/heads/main'])

    def test_readiness_requires_exact_deployed_artifact_and_fresh_existing_qualification(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        evidence = {'artifactDigest': 'b' * 64, 'artifact': {'commit': 'a' * 40, 'buildId': 'build-1'}}
        producer = {'producerId': 'test-web'}
        proof = {'schemaVersion': 1, 'status': 'READY', 'producerId': producer['producerId'], **evidence['artifact'],
                 'artifactDigest': evidence['artifactDigest'], 'verifiedAt': now.isoformat(),
                 'expiresAt': (now + datetime.timedelta(minutes=5)).isoformat(),
                 'selection': {'producers': [{'producerId': producer['producerId'], 'qualificationId': '31'}]}}
        self.assertEqual(adapter.assert_readiness(proof, producer, evidence), proof['selection'])
        for change in [{'status': 'DEPLOYED'}, {'commit': 'c' * 40}, {'buildId': 'other'}, {'artifactDigest': 'd' * 64},
                       {'expiresAt': now.isoformat()}, {'verifiedAt': (now + datetime.timedelta(seconds=30)).isoformat()},
                       {'selection': {'producers': []}}, {'expiresAt': (now + datetime.timedelta(minutes=11)).isoformat()}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                adapter.assert_readiness({**proof, **change}, producer, evidence)

    def test_local_or_fabricated_toolchain_cannot_be_distributed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            path = root / 'permission-toolchain.lock.json'
            for lock in [{'mode': 'LOCAL_UNCOMMITTED', 'sdk': {'commit': None}},
                         {'mode': 'PINNED_COMMIT', 'sdk': {'commit': 'main'}}]:
                path.write_text(json.dumps(lock))
                with self.assertRaisesRegex(ValueError, 'REAL_COMMITTED_TOOLCHAIN_PIN'):
                    adapter.run('pin', root)


    def test_local_online_phase_rejects_before_environment_credentials_or_network(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'permission-toolchain.lock.json').write_text(json.dumps({'mode': 'LOCAL_UNCOMMITTED'}))
            for phase in ['register', 'activate']:
                with self.subTest(phase=phase), patch.dict(os.environ, {}, clear=True), \
                        patch.object(adapter, 'private_read_token') as credential, patch.object(adapter, 'gitlab_read') as network:
                    with self.assertRaisesRegex(ValueError, 'LOCAL_TOOLCHAIN_ONLINE_FORBIDDEN'):
                        adapter.run(phase, root)
                    credential.assert_not_called()
                    network.assert_not_called()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.producer = {'producerId': 'tianshu-java', 'module': 'stellar-enclosure-tianshu-admin',
                         'artifactFile': 'stellar-enclosure-tianshu-admin-exec.jar'}
        self.evidence = {'producerId': 'tianshu-java', 'artifactFile': self.producer['artifactFile'],
                         'artifactDigest': 'a' * 64, 'artifact': {'commit': 'b' * 40, 'buildId': 'ci-7'}}

    def proof(self):
        now = datetime.datetime.now(datetime.timezone.utc)
        return {'schemaVersion': 1, 'status': 'READY', 'producerId': 'tianshu-java', 'artifactDigest': 'a' * 64,
                'commit': 'b' * 40, 'buildId': 'ci-7', 'verifiedAt': (now - datetime.timedelta(seconds=10)).isoformat(),
                'expiresAt': (now + datetime.timedelta(seconds=120)).isoformat(),
                'selection': {'producers': [{'producerId': 'tianshu-java', 'qualificationId': '123'}]}}

    def test_gitlab_activation_requires_trusted_job_pipeline_and_original_artifact(self):
        proof = self.proof(); proof['gitlab'] = {'projectId': '11', 'pipelineId': '22', 'jobId': '33'}
        now = datetime.datetime.now(datetime.timezone.utc)
        job = {'id': 33, 'name': 'deploy-qualified', 'status': 'success', 'ref': 'main', 'tag': False,
               'erased_at': None, 'commit': {'id': 'b' * 40}, 'pipeline': {'id': 22}, 'finished_at': now.isoformat()}
        pipeline = {'id': 22, 'status': 'success', 'sha': 'b' * 40, 'ref': 'main', 'source': 'web'}
        env = {'GITLAB_CI': 'true', 'CI_PROJECT_ID': '11', 'CI_API_V4_URL': 'https://gitlab.example/api/v4',
               'CI_SERVER_URL': 'https://gitlab.example', 'CI_COMMIT_BRANCH': 'main', 'CI_JOB_NAME': 'permission-activate',
               'PERMISSION_DEPLOYMENT_JOB_NAME': 'deploy-qualified'}
        with patch.dict(os.environ, env, clear=True), patch.object(ci, 'private_read_token', return_value='private-read-token'), \
                patch.object(ci, 'gitlab_read', side_effect=[job, pipeline, proof]) as read:
            ci.verify_gitlab_deployment(proof, self.evidence)
            self.assertEqual(3, read.call_count)
            self.assertTrue(read.call_args.args[0].endswith('/jobs/33/artifacts/permission-deployment.json'))
            self.assertTrue(read.call_args.kwargs['artifact'])
        for changed in [{'status': 'canceled'}, {'name': 'build-and-unit-tests'}, {'ref': 'other'}, {'commit': {'id': 'c' * 40}}]:
            wrong = dict(job); wrong.update(changed)
            with patch.dict(os.environ, env, clear=True), patch.object(ci, 'private_read_token', return_value='secret'), \
                    patch.object(ci, 'gitlab_read', return_value=wrong), self.assertRaisesRegex(ValueError, 'JOB_MISMATCH'):
                ci.verify_gitlab_deployment(proof, self.evidence)
        with patch.dict(os.environ, env, clear=True), patch.object(ci, 'private_read_token', return_value='secret'), \
                patch.object(ci, 'gitlab_read', side_effect=[job, dict(pipeline, status='canceled')]), \
                self.assertRaisesRegex(ValueError, 'PIPELINE_MISMATCH'):
            ci.verify_gitlab_deployment(proof, self.evidence)
        with patch.dict(os.environ, env, clear=True), patch.object(ci, 'private_read_token', return_value='secret'), \
                patch.object(ci, 'gitlab_read', side_effect=[job, pipeline, dict(proof, artifactDigest='c' * 64)]), \
                self.assertRaisesRegex(ValueError, 'ARTIFACT_MISMATCH'):
            ci.verify_gitlab_deployment(proof, self.evidence)

    def test_gitlab_cannot_redirect_read_token_to_a_proof_supplied_origin(self):
        proof = self.proof(); proof['gitlab'] = {'projectId': '11', 'pipelineId': '22', 'jobId': '33'}
        env = {'GITLAB_CI': 'true', 'CI_PROJECT_ID': '11', 'CI_API_V4_URL': 'https://other.example/api/v4',
               'CI_SERVER_URL': 'https://gitlab.example'}
        with patch.dict(os.environ, env, clear=True), patch.object(ci, 'private_read_token') as credential:
            with self.assertRaisesRegex(ValueError, 'API_ORIGIN_INVALID'):
                ci.verify_gitlab_deployment(proof, self.evidence)
            credential.assert_not_called()
        proof['gitlab']['projectId'] = '99'
        with patch.dict(os.environ, env, clear=True), self.assertRaisesRegex(ValueError, 'PROVENANCE_REQUIRED'):
            ci.verify_gitlab_deployment(proof, self.evidence)

    def test_gitlab_read_token_is_private_and_never_forwarded_to_artifact_cdn(self):
        token = self.root / 'read-token'; token.write_text('private-read-token'); token.chmod(0o600)
        with patch.dict(os.environ, {'PERMISSION_GITLAB_READ_TOKEN_FILE': str(token)}, clear=True):
            self.assertEqual('private-read-token', ci.private_read_token())
            token.chmod(0o644)
            with self.assertRaisesRegex(ValueError, 'PRIVATE_READ_TOKEN_REQUIRED'):
                ci.private_read_token()
        import io
        import urllib.error
        error = urllib.error.HTTPError('https://gitlab.example/artifact', 302, 'redirect',
                                       {'Location': 'https://storage.example/proof?signature=private-capability'}, io.BytesIO())
        response = unittest.mock.MagicMock()
        response.__enter__.return_value = response; response.status = 200; response.read.return_value = b'{"status":"READY"}'
        opener = unittest.mock.Mock(); opener.open.side_effect = [error, response]
        with patch.object(ci.urllib.request, 'build_opener', return_value=opener):
            self.assertEqual({'status': 'READY'}, ci.gitlab_read('https://gitlab.example/artifact', 'private-read-token', artifact=True))
        first, second = [call.args[0] for call in opener.open.call_args_list]
        self.assertIn('private-read-token', first.headers.values())
        self.assertNotIn('private-read-token', second.headers.values())
        self.assertFalse(any(key.lower() in {'private-token', 'authorization'} for key in second.headers))


if __name__ == '__main__':
    unittest.main()

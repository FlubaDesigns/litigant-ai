"""Check that cloud credentials follow complete CI and the LAI-only controller."""
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ReleaseBoundaryTests(unittest.TestCase):
    def test_source_gate_is_credential_free(self):
        workflow = (ROOT / '.github/workflows/deploy-cloudrun.yml').read_text()
        source, cloud = workflow.split('  cloud-preflight:', 1)
        self.assertIn('check-release:', source)
        self.assertIn('contents: read', source)
        for pattern in [r'id-token:', r'actions:\s*write', r'google-github-actions/auth',
                        r'firebase\s+deploy', r'gcloud\s', r'deploy-cloudrun\.mjs',
                        r'revokeRefreshTokens', r'runTransaction', r'identitytoolkit',
                        r'verify-admin-monitoring', r'verify-guest-invitations']:
            self.assertNotRegex(source, pattern)
        for command in ['python3 scripts/source_safety.py',
                        'node --test scripts/test_lai_release.mjs',
                        'pnpm --filter @workspace/api-server run test',
                        'pnpm run typecheck',
                        'pnpm --filter @workspace/gh-brain run test',
                        'pnpm exec playwright test']:
            self.assertIn(command, source)
        self.assertLess(source.index('pnpm exec playwright test'), source.index('name: Build API'))
        self.assertIn('needs: check-release', cloud)
        self.assertIn("github.event_name == 'push'", cloud)
        self.assertIn("github.ref == 'refs/heads/main'", cloud)
        self.assertIn("github.repository == 'FlubaDesigns/litigant-ai'", cloud)
        self.assertIn('id-token: write', cloud)
        self.assertIn('cancel-in-progress: false', cloud)
        self.assertNotIn('cancel-in-progress: true', cloud)
        self.assertNotRegex(cloud, r'^\s+environment:', 'environment changes OIDC identity')
        self.assertIn('google-github-actions/auth@v3', cloud)
        self.assertIn('secrets.WIF_PROVIDER', cloud)
        self.assertIn('secrets.WIF_SERVICE_ACCOUNT', cloud)
        self.assertLess(cloud.index('lai-release.mjs prepare'), cloud.index('google-github-actions/auth'))
        self.assertEqual(cloud.count("if: steps.plan.outputs.action == 'deploy'"), 3)
        prepare_step = cloud.split('name: Build frontend and probe isolated API container before authentication', 1)[1].split('- uses:', 1)[0]
        self.assertIn("if: steps.plan.outputs.action == 'deploy'", prepare_step)
        controller = (ROOT / 'scripts/lai-release.mjs').read_text()
        release = controller.split('async function release() {', 1)[1]
        self.assertLess(release.index("descriptor.action === 'inspect'"), release.index("'build.json'"))
        self.assertIn('name: Verify existing LAI cloud access', cloud)
        for pattern in [r'firebase\s+deploy', r'gcloud\s', r'deploy-cloudrun\.mjs',
                        r'FIREBASE_SERVICE_ACCOUNT', r'SQUARE_', r'ANTHROPIC_',
                        r'--set-env-vars', r'--env-vars-file', r'run services replace']:
            self.assertNotRegex(cloud, pattern)

    def test_exact_additive_index_boundary(self):
        controller = (ROOT / 'scripts/lai-release.mjs').read_text()
        release = controller.split('async function release() {', 1)[1]
        self.assertLess(release.index("descriptor.action === 'inspect'"), release.index("{ recheck }"))
        self.assertLess(release.index('paymentHistoryIndexGate(context, descriptor, { recheck })'), release.index("'configure-docker'"))
        self.assertLess(release.index('paymentHistoryIndexGate(context, descriptor, { recheck })'), release.index("'run', 'services', 'update'"))
        self.assertIn("'datastore.indexes.list', 'datastore.indexes.create'", controller)
        self.assertNotRegex(controller, r"datastore\.indexes\.(delete|update)")
        self.assertNotIn("'DELETE'", controller)
        self.assertNotIn("'--only', 'firestore'", controller)
        self.assertNotIn("'--only', 'firestore:indexes'", controller)
        import json
        catalog = json.loads((ROOT / 'firestore.indexes.json').read_text())
        indexes = [x for x in catalog['indexes'] if x['collectionGroup'] == 'credit_transactions']
        required = [
            {'fieldPath': 'userId', 'order': 'ASCENDING'},
            {'fieldPath': 'type', 'order': 'ASCENDING'},
            {'fieldPath': 'createdAt', 'order': 'DESCENDING'},
        ]
        self.assertEqual(sum(x['queryScope'] == 'COLLECTION' and x['fields'] == required for x in indexes), 1)
        # The existing live two-field index is managed outside this source catalog;
        # inspectPaymentIndexes requires it READY and verifies preservation.
        self.assertIn("'create exact payment-history index', 'POST', PAYMENT_INDEX", controller)
        self.assertIn("'projects/litigant-ai/databases/(default)/collectionGroups/credit_transactions'", controller)

    def test_release_controller_guards(self):
        subprocess.run(['node', '--test', 'scripts/test_lai_release.mjs'], cwd=ROOT, check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


if __name__ == '__main__':
    unittest.main()

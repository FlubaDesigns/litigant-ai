"""Keep source CI credential-free and production releases in the Engine wrapper."""
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ReleaseBoundaryTests(unittest.TestCase):
    def test_source_gate_cannot_deploy_or_mutate_accounts(self):
        workflow = (ROOT / '.github/workflows/deploy-cloudrun.yml').read_text()
        self.assertIn('check-release:', workflow)
        self.assertIn('contents: read', workflow)
        for pattern in [r'id-token:', r'actions:\s*write', r'google-github-actions/auth',
                        r'firebase\s+deploy', r'gcloud\s', r'deploy-cloudrun\.mjs',
                        r'revokeRefreshTokens', r'runTransaction', r'identitytoolkit',
                        r'verify-admin-monitoring', r'verify-guest-invitations']:
            self.assertNotRegex(workflow, pattern)
        for command in ['python3 scripts/source_safety.py',
                        'pnpm --filter @workspace/api-server run test',
                        'pnpm run typecheck',
                        'pnpm --filter @workspace/gh-brain run test',
                        'pnpm exec playwright test']:
            self.assertIn(command, workflow)
        self.assertLess(workflow.index('pnpm exec playwright test'), workflow.index('name: Build API'))


if __name__ == '__main__':
    unittest.main()

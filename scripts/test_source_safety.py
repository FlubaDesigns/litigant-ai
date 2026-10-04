import io
import unittest
import zipfile

from source_safety import inspect_bytes


class SourceSafetyTests(unittest.TestCase):
    def test_private_key(self):
        marker = b'-----BEGIN ' + b'PRIVATE KEY-----'
        self.assertTrue(inspect_bytes('key.json', marker))

    def test_nested_archive(self):
        inner = io.BytesIO()
        with zipfile.ZipFile(inner, 'w') as z:
            z.writestr('.replit', '[userenv.shared]\nADMIN_MASTER_SECRET="test-only"')
        outer = io.BytesIO()
        with zipfile.ZipFile(outer, 'w') as z:
            z.writestr('source.zip', inner.getvalue())
        result = inspect_bytes('download.zip', outer.getvalue())
        self.assertEqual(result[0][0], 'download.zip!source.zip!.replit')
        self.assertNotIn('test-only', str(result))

    def test_library_identifier_is_not_resend_key(self):
        self.assertFalse(inspect_bytes('bundle.js', b'require_NodejsStreamOutputAdapter'))

    def test_actual_resend_shape(self):
        self.assertTrue(inspect_bytes('config', b're_' + b'X' * 30))

    def test_environment_reference_is_safe(self):
        self.assertFalse(inspect_bytes('deploy.yml', b'OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}'))

    def test_corrupt_archive_fails_closed(self):
        self.assertTrue(inspect_bytes('source.zip', b'PK\x03\x04broken'))


if __name__ == '__main__':
    unittest.main()

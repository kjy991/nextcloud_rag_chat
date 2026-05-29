import unittest

from services.credentials import decrypt_app_password


class CredentialsTest(unittest.TestCase):
    def test_returns_plaintext_legacy_passwords(self):
        self.assertEqual(decrypt_app_password("legacy-app-password", "secret"), "legacy-app-password")

    def test_decrypts_api_encrypted_password_format(self):
        encrypted = (
            "enc:v1:"
            "dGVzdC1ub25jZTEy:"
            "euIg86fiMDw4V6rdJ7UvLQ==:"
            "5frv1QpJ9M7zxuFt"
        )

        self.assertEqual(decrypt_app_password(encrypted, "shared-secret"), "app-password")


if __name__ == "__main__":
    unittest.main()

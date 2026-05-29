import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PREFIX = "enc:v1:"


def get_app_password_secret() -> str | None:
    return os.environ.get("NC_APP_PASSWORD_ENCRYPTION_KEY") or os.environ.get("JWT_SECRET")


def decrypt_app_password(value: str, secret: str | None = None) -> str:
    if not value.startswith(PREFIX):
        return value

    resolved_secret = secret or get_app_password_secret()
    if not resolved_secret:
        raise RuntimeError("NC app password is encrypted but NC_APP_PASSWORD_ENCRYPTION_KEY/JWT_SECRET is not set")

    parts = value.split(":")
    if len(parts) != 5 or parts[0] != "enc" or parts[1] != "v1":
        raise ValueError("Invalid encrypted app password format")

    iv = base64.b64decode(parts[2])
    tag = base64.b64decode(parts[3])
    ciphertext = base64.b64decode(parts[4])
    key = hashlib.sha256(resolved_secret.encode("utf-8")).digest()

    return AESGCM(key).decrypt(iv, ciphertext + tag, None).decode("utf-8")

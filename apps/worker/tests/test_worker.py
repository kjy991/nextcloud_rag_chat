import os
import sys
import unittest
from unittest.mock import MagicMock

# main.py는 모듈 레벨에서 DATABASE_URL을 읽으므로 import 전에 환경변수 설정
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from main import expire_stuck_documents, set_status, _ALLOWED_UPDATE_FIELDS


class TestResetStuckProcessing(unittest.TestCase):
    def _make_conn(self, rowcount=0):
        cur = MagicMock()
        cur.__enter__ = MagicMock(return_value=cur)
        cur.__exit__ = MagicMock(return_value=False)
        cur.rowcount = rowcount

        conn = MagicMock()
        conn.cursor.return_value = cur
        return conn, cur

    def test_executes_update_with_correct_interval(self):
        conn, cur = self._make_conn(rowcount=0)
        expire_stuck_documents(conn, processing_timeout_minutes=30, pending_timeout_minutes=3)

        sql, params = cur.execute.call_args.args
        self.assertIn("PROCESSING", sql)
        self.assertIn("PENDING", sql)
        self.assertIn("FAILED", sql)
        self.assertIn("updated_at", sql)
        self.assertEqual(params, (30, 3))
        conn.commit.assert_called_once()

    def test_returns_count_of_recovered_documents(self):
        conn, cur = self._make_conn(rowcount=3)
        count = expire_stuck_documents(conn, processing_timeout_minutes=30, pending_timeout_minutes=3)
        self.assertEqual(count, 3)

    def test_returns_zero_when_no_stuck_documents(self):
        conn, cur = self._make_conn(rowcount=0)
        count = expire_stuck_documents(conn, processing_timeout_minutes=30, pending_timeout_minutes=3)
        self.assertEqual(count, 0)


class TestSetStatusAllowlist(unittest.TestCase):
    def _make_conn(self):
        cur = MagicMock()
        cur.__enter__ = MagicMock(return_value=cur)
        cur.__exit__ = MagicMock(return_value=False)
        conn = MagicMock()
        conn.cursor.return_value = cur
        return conn

    def test_raises_on_disallowed_field(self):
        conn = self._make_conn()
        with self.assertRaises(ValueError) as ctx:
            set_status(conn, "doc-1", "PROCESSING", malicious_field="DROP TABLE")
        self.assertIn("malicious_field", str(ctx.exception))
        conn.commit.assert_not_called()

    def test_allowed_fields_pass_without_error(self):
        conn = self._make_conn()
        # page_count, chunk_count are allowed
        try:
            set_status(conn, "doc-1", "COMPLETED", page_count=5, chunk_count=42)
        except ValueError:
            self.fail("허용된 필드에서 ValueError 발생")

    def test_allowlist_contains_expected_fields(self):
        self.assertIn("index_status", _ALLOWED_UPDATE_FIELDS)
        self.assertIn("page_count", _ALLOWED_UPDATE_FIELDS)
        self.assertIn("chunk_count", _ALLOWED_UPDATE_FIELDS)
        self.assertIn("indexed_at", _ALLOWED_UPDATE_FIELDS)


if __name__ == "__main__":
    unittest.main()

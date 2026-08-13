"""
Database helper for caching API calls and storing corridor evaluation traces.
Primary: PostgreSQL via Neon DB (using DB_URL) with connection pool.
Fallback: SQLite local cache (if PostgreSQL is unreachable or unavailable).
"""

import os
import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple


def _load_env():
    """Auto-load .env from Backend directory if not already set."""
    env_path = Path(__file__).parent / ".env"
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("'").strip('"')
                    os.environ.setdefault(k, v)


_load_env()

DB_URL = os.getenv("DB_URL", "")
SQLITE_DB_PATH = Path(__file__).parent / "airlane_cache.db"

# PostgreSQL driver & pool setup
HAS_PG = False
try:
    import psycopg2
    import psycopg2.pool
    HAS_PG = True
except ImportError:
    HAS_PG = False

_PG_POOL = None
_PG_FAILED = False
_POOL_LOCK = threading.Lock()


def _get_pg_pool():
    global _PG_POOL, _PG_FAILED
    if _PG_FAILED or not DB_URL or not HAS_PG:
        return None
    if _PG_POOL is None:
        with _POOL_LOCK:
            if _PG_POOL is None:
                try:
                    _PG_POOL = psycopg2.pool.ThreadedConnectionPool(1, 10, DB_URL, connect_timeout=3)
                except Exception as e:
                    print(f"[DB Warning] PostgreSQL connection pool creation failed: {e}. Bypassing Postgres for local SQLite cache.")
                    _PG_FAILED = True
                    return None
    return _PG_POOL


@contextmanager
def get_pg_conn():
    """Thread-safe context manager supplying a reused PostgreSQL connection from pool."""
    pool = _get_pg_pool()
    if not pool:
        yield None
        return
    conn = None
    try:
        conn = pool.getconn()
        yield conn
    except Exception as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        print(f"[DB Warning] Postgres connection error: {e}")
        yield None
    finally:
        if conn and pool:
            try:
                pool.putconn(conn)
            except Exception:
                pass


def get_sqlite_conn():
    """Fallback connection to local SQLite database."""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables for API cache (api_cache and fetch_cache)."""
    with get_pg_conn() as pg_conn:
        if pg_conn:
            try:
                with pg_conn.cursor() as cursor:
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS api_cache (
                            key VARCHAR(255) PRIMARY KEY,
                            source VARCHAR(100) NOT NULL,
                            payload TEXT NOT NULL,
                            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                        CREATE TABLE IF NOT EXISTS fetch_cache (
                            grid_key VARCHAR(255) PRIMARY KEY,
                            source VARCHAR(100) NOT NULL,
                            payload TEXT NOT NULL,
                            fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                        );
                    """)
                    pg_conn.commit()
                print("[DB] Initialized PostgreSQL tables (api_cache & fetch_cache) via Neon DB connection pool.")
            except Exception as e:
                print(f"[DB Error] PostgreSQL init failed: {e}. Falling back to SQLite.")

    # Always ensure SQLite tables are initialized as fallback
    try:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.executescript("""
            CREATE TABLE IF NOT EXISTS api_cache (
                key TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                payload TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS fetch_cache (
                grid_key TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                payload TEXT NOT NULL,
                fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()
        conn.close()
        print("[DB] Initialized SQLite local database tables.")
    except Exception as e:
        print(f"[DB Error] SQLite init failed: {e}")


def get_cached_response(key: str) -> Optional[Dict[str, Any]]:
    """Retrieve cached payload by key from fetch_cache or api_cache."""
    with get_pg_conn() as pg_conn:
        if pg_conn:
            try:
                with pg_conn.cursor() as cursor:
                    cursor.execute("SELECT payload FROM fetch_cache WHERE grid_key = %s", (key,))
                    row = cursor.fetchone()
                    if not row:
                        cursor.execute("SELECT payload FROM api_cache WHERE key = %s", (key,))
                        row = cursor.fetchone()
                    if row:
                        val = json.loads(row[0])
                        if isinstance(val, dict) and val.get("status") in ("UNKNOWN", "FAILED"):
                            return None
                        return val
            except Exception as e:
                print(f"[DB Warning] Postgres read error for {key}: {e}")

    try:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT payload FROM fetch_cache WHERE grid_key = ?", (key,))
        row = cursor.fetchone()
        if not row:
            cursor.execute("SELECT payload FROM api_cache WHERE key = ?", (key,))
            row = cursor.fetchone()
        conn.close()
        if row:
            val = json.loads(row["payload"])
            if isinstance(val, dict) and val.get("status") in ("UNKNOWN", "FAILED"):
                return None
            return val
    except Exception as e:
        print(f"[DB Warning] SQLite read error for {key}: {e}")

    return None


def set_cached_response(key: str, source: str, data: Dict[str, Any]):
    """Store API payload in fetch_cache and api_cache."""
    if isinstance(data, dict) and data.get("status") in ("UNKNOWN", "FAILED"):
        return

    payload_str = json.dumps(data)

    with get_pg_conn() as pg_conn:
        if pg_conn:
            try:
                with pg_conn.cursor() as cursor:
                    cursor.execute("""
                        INSERT INTO fetch_cache (grid_key, source, payload, fetched_at)
                        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (grid_key) DO UPDATE SET
                            source = EXCLUDED.source,
                            payload = EXCLUDED.payload,
                            fetched_at = CURRENT_TIMESTAMP;
                    """, (key, source, payload_str))
                    cursor.execute("""
                        INSERT INTO api_cache (key, source, payload, timestamp)
                        VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                        ON CONFLICT (key) DO UPDATE SET
                            source = EXCLUDED.source,
                            payload = EXCLUDED.payload,
                            timestamp = CURRENT_TIMESTAMP;
                    """, (key, source, payload_str))
                    pg_conn.commit()
                return
            except Exception as e:
                print(f"[DB Warning] Postgres write error for {key}: {e}")

    try:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO fetch_cache (grid_key, source, payload, fetched_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        """, (key, source, payload_str))
        cursor.execute("""
            INSERT OR REPLACE INTO api_cache (key, source, payload)
            VALUES (?, ?, ?)
        """, (key, source, payload_str))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB Warning] SQLite write error for {key}: {e}")


def get_cached_grid_batch(grid_keys: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Retrieve multiple cached responses at once by key across fetch_cache and api_cache tables.
    Returns dictionary mapping key -> parsed payload dict.
    Filters out any cached responses with UNKNOWN or FAILED status.
    """
    if not grid_keys:
        return {}

    results = {}
    unique_keys = list(set(grid_keys))

    with get_pg_conn() as pg_conn:
        if pg_conn:
            try:
                with pg_conn.cursor() as cursor:
                    format_strings = ','.join(['%s'] * len(unique_keys))
                    cursor.execute(f"SELECT grid_key, payload FROM fetch_cache WHERE grid_key IN ({format_strings})", tuple(unique_keys))
                    rows = cursor.fetchall()
                    for row in rows:
                        p_data = json.loads(row[1])
                        if isinstance(p_data, dict) and p_data.get("status") not in ("UNKNOWN", "FAILED"):
                            results[row[0]] = p_data

                    missing_keys = [k for k in unique_keys if k not in results]
                    if missing_keys:
                        fmt_missing = ','.join(['%s'] * len(missing_keys))
                        cursor.execute(f"SELECT key, payload FROM api_cache WHERE key IN ({fmt_missing})", tuple(missing_keys))
                        for row in cursor.fetchall():
                            p_data = json.loads(row[1])
                            if isinstance(p_data, dict) and p_data.get("status") not in ("UNKNOWN", "FAILED"):
                                results[row[0]] = p_data
                    return results
            except Exception as e:
                print(f"[DB Warning] Postgres batch read error: {e}")

    try:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        placeholders = ','.join(['?'] * len(unique_keys))
        cursor.execute(f"SELECT grid_key, payload FROM fetch_cache WHERE grid_key IN ({placeholders})", tuple(unique_keys))
        rows = cursor.fetchall()
        for row in rows:
            p_data = json.loads(row["payload"])
            if isinstance(p_data, dict) and p_data.get("status") not in ("UNKNOWN", "FAILED"):
                results[row["grid_key"]] = p_data

        missing_keys = [k for k in unique_keys if k not in results]
        if missing_keys:
            placeholders_missing = ','.join(['?'] * len(missing_keys))
            cursor.execute(f"SELECT key, payload FROM api_cache WHERE key IN ({placeholders_missing})", tuple(missing_keys))
            for row in cursor.fetchall():
                p_data = json.loads(row["payload"])
                if isinstance(p_data, dict) and p_data.get("status") not in ("UNKNOWN", "FAILED"):
                    results[row["key"]] = p_data
        conn.close()
    except Exception as e:
        print(f"[DB Warning] SQLite batch read error: {e}")

    return results


def set_cached_grid_batch(items: List[Tuple[str, str, Dict[str, Any]]]):
    """
    Store multiple grid cache items in one transaction.
    Items format: [(grid_key, source, payload_dict), ...]
    Filters out any items with UNKNOWN or FAILED status.
    """
    valid_items = [item for item in items if isinstance(item[2], dict) and item[2].get("status") not in ("UNKNOWN", "FAILED")]
    if not valid_items:
        return

    with get_pg_conn() as pg_conn:
        if pg_conn:
            try:
                with pg_conn.cursor() as cursor:
                    for grid_key, source, data in valid_items:
                        payload_str = json.dumps(data)
                        cursor.execute("""
                            INSERT INTO fetch_cache (grid_key, source, payload, fetched_at)
                            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
                            ON CONFLICT (grid_key) DO UPDATE SET
                                source = EXCLUDED.source,
                                payload = EXCLUDED.payload,
                                fetched_at = CURRENT_TIMESTAMP;
                        """, (grid_key, source, payload_str))
                    pg_conn.commit()
                return
            except Exception as e:
                print(f"[DB Warning] Postgres batch write error: {e}")

    try:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        for grid_key, source, data in valid_items:
            payload_str = json.dumps(data)
            cursor.execute("""
                INSERT OR REPLACE INTO fetch_cache (grid_key, source, payload, fetched_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            """, (grid_key, source, payload_str))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB Warning] SQLite batch write error: {e}")


def clear_fetch_cache():
    """Clear all records from fetch_cache and api_cache tables."""
    with get_pg_conn() as pg_conn:
        if pg_conn:
            try:
                with pg_conn.cursor() as cursor:
                    cursor.execute("TRUNCATE TABLE fetch_cache; TRUNCATE TABLE api_cache;")
                    pg_conn.commit()
                print("[DB] Cleared PostgreSQL cache tables.")
                return
            except Exception as e:
                print(f"[DB Warning] Postgres clear cache error: {e}")

    try:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM fetch_cache; DELETE FROM api_cache;")
        conn.commit()
        conn.close()
        print("[DB] Cleared SQLite cache tables.")
    except Exception as e:
        print(f"[DB Warning] SQLite clear cache error: {e}")


# Auto-initialize DB on import
init_db()

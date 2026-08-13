"""
Database helper for caching API calls and storing corridor evaluation traces.
Primary: PostgreSQL via Neon DB (using DB_URL).
Fallback: SQLite local cache (if PostgreSQL is unreachable or unavailable).
"""

import os
import json
import sqlite3
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

# PostgreSQL driver import (psycopg2-binary)
HAS_PG = False
try:
    import psycopg2
    HAS_PG = True
except ImportError:
    HAS_PG = False


def get_pg_conn():
    """Get a raw connection to PostgreSQL via DB_URL if driver and URL are present."""
    if not DB_URL or not HAS_PG:
        return None
    try:
        return psycopg2.connect(DB_URL)
    except Exception as e:
        print(f"[DB Warning] PostgreSQL connection failed: {e}")
        return None


def get_sqlite_conn():
    """Fallback connection to local SQLite database."""
    conn = sqlite3.connect(SQLITE_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables for API cache (api_cache and fetch_cache)."""
    # Attempt Postgres initialization
    pg_conn = get_pg_conn()
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
            pg_conn.close()
            print("[DB] Initialized PostgreSQL tables (api_cache & fetch_cache) via Neon DB.")
            return
        except Exception as e:
            print(f"[DB Error] PostgreSQL init failed: {e}. Falling back to SQLite.")

    # SQLite fallback init
    conn = get_sqlite_conn()
    cursor = conn.cursor()
    cursor.execute("""
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
    print("[DB] Initialized SQLite local database tables fallback.")


def get_cached_response(key: str) -> Optional[Dict[str, Any]]:
    """Retrieve cached payload by key from fetch_cache or api_cache."""
    pg_conn = get_pg_conn()
    if pg_conn:
        try:
            with pg_conn.cursor() as cursor:
                cursor.execute("SELECT payload FROM fetch_cache WHERE grid_key = %s", (key,))
                row = cursor.fetchone()
                if not row:
                    cursor.execute("SELECT payload FROM api_cache WHERE key = %s", (key,))
                    row = cursor.fetchone()
                pg_conn.close()
                if row:
                    return json.loads(row[0])
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
            return json.loads(row["payload"])
    except Exception as e:
        print(f"[DB Warning] SQLite read error for {key}: {e}")

    return None


def set_cached_response(key: str, source: str, data: Dict[str, Any]):
    """Store API payload in fetch_cache and api_cache."""
    payload_str = json.dumps(data)

    pg_conn = get_pg_conn()
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
            pg_conn.close()
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
    Retrieve multiple cached responses at once by grid_key.
    Returns dictionary mapping grid_key -> parsed payload dict.
    """
    if not grid_keys:
        return {}

    results = {}
    unique_keys = list(set(grid_keys))

    pg_conn = get_pg_conn()
    if pg_conn:
        try:
            with pg_conn.cursor() as cursor:
                format_strings = ','.join(['%s'] * len(unique_keys))
                cursor.execute(f"SELECT grid_key, payload FROM fetch_cache WHERE grid_key IN ({format_strings})", tuple(unique_keys))
                rows = cursor.fetchall()
                pg_conn.close()
                for row in rows:
                    p_data = json.loads(row[1])
                    if isinstance(p_data, dict) and p_data.get("status") != "UNKNOWN":
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
        conn.close()
        for row in rows:
            p_data = json.loads(row["payload"])
            if isinstance(p_data, dict) and p_data.get("status") != "UNKNOWN":
                results[row["grid_key"]] = p_data
    except Exception as e:
        print(f"[DB Warning] SQLite batch read error: {e}")

    return results


def set_cached_grid_batch(items: List[Tuple[str, str, Dict[str, Any]]]):
    """
    Store multiple grid cache items in one transaction.
    Items format: [(grid_key, source, payload_dict), ...]
    """
    if not items:
        return

    pg_conn = get_pg_conn()
    if pg_conn:
        try:
            with pg_conn.cursor() as cursor:
                for grid_key, source, data in items:
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
            pg_conn.close()
            return
        except Exception as e:
            print(f"[DB Warning] Postgres batch write error: {e}")

    try:
        conn = get_sqlite_conn()
        cursor = conn.cursor()
        for grid_key, source, data in items:
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
    pg_conn = get_pg_conn()
    if pg_conn:
        try:
            with pg_conn.cursor() as cursor:
                cursor.execute("TRUNCATE TABLE fetch_cache; TRUNCATE TABLE api_cache;")
                pg_conn.commit()
            pg_conn.close()
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

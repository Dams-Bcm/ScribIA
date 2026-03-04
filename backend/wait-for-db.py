"""
Wait for MSSQL to be ready, then create the database if it doesn't exist.
Used as entrypoint script in Docker.
"""
import time
import sys
import pyodbc
from app.config import settings


def wait_for_mssql(max_retries: int = 30, delay: float = 2.0):
    """Wait until MSSQL accepts connections, then ensure the database exists."""
    driver = settings.db_driver
    host = settings.db_host
    port = settings.db_port
    user = settings.db_user
    password = settings.db_password
    db_name = settings.db_name

    # Connection string to master (to create the DB if needed)
    master_conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={host},{port};"
        f"DATABASE=master;"
        f"UID={user};"
        f"PWD={password};"
        f"TrustServerCertificate=yes;"
    )

    for attempt in range(1, max_retries + 1):
        try:
            conn = pyodbc.connect(master_conn_str, timeout=5)
            cursor = conn.cursor()

            # Create database if it doesn't exist
            cursor.execute(f"SELECT DB_ID('{db_name}')")
            if cursor.fetchone()[0] is None:
                conn.autocommit = True
                cursor.execute(f"CREATE DATABASE [{db_name}]")
                print(f"[init] Database '{db_name}' created.")
            else:
                print(f"[init] Database '{db_name}' already exists.")

            conn.close()
            return True
        except pyodbc.Error as e:
            print(f"[init] Waiting for MSSQL ({attempt}/{max_retries}): {e}")
            time.sleep(delay)

    print("[init] MSSQL not available after max retries.", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    wait_for_mssql()

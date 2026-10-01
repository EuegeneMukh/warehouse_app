import csv
import datetime as dt
import json
import os
import shutil
import sqlite3
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

OPTIONS_FILE = "/data/options.json"
if os.path.exists(OPTIONS_FILE):
    with open(OPTIONS_FILE, encoding="utf-8") as options_file:
        options = json.load(options_file)
        os.environ.setdefault("BACKUP_INTERVAL_HOURS", str(options.get("backup_interval_hours", 24)))
        os.environ.setdefault("BACKUP_RETENTION", str(options.get("backup_retention", 30)))

DB_PATH = os.environ.get("DB_PATH", "/data/warehouse.db")
BACKUP_DIR = os.environ.get("BACKUP_DIR", "/share/warehouse-backups")
IMPORT_DIR = os.environ.get("IMPORT_DIR", "/app/import")
STATIC_DIR = os.environ.get("STATIC_DIR", "/app/build")
BACKUP_INTERVAL = max(0, int(os.environ.get("BACKUP_INTERVAL_HOURS", "24")))
BACKUP_RETENTION = max(1, int(os.environ.get("BACKUP_RETENTION", "30")))
DEFAULT_USER = "local-user"


def connection():
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA foreign_keys = ON")
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connection() as db:
        db.executescript("""
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS components (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
          category TEXT, nominal TEXT, package TEXT, manufacturer TEXT,
          article TEXT, note TEXT, created_at TEXT
        );
        CREATE TABLE IF NOT EXISTS inventory (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, component_id TEXT NOT NULL,
          location TEXT NOT NULL DEFAULT '', quantity INTEGER NOT NULL DEFAULT 0,
          created_at TEXT, UNIQUE(user_id, component_id, location),
          FOREIGN KEY(component_id) REFERENCES components(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS organizers (
          id TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL,
          rows TEXT NOT NULL, created_at TEXT, PRIMARY KEY(user_id, id)
        );
        """)


def import_csv_if_empty():
    with connection() as db:
        count = db.execute("SELECT COUNT(*) FROM components").fetchone()[0]
        if count:
            return
        components = os.path.join(IMPORT_DIR, "components_rows.csv")
        if not os.path.exists(components):
            return
        with open(components, newline="", encoding="utf-8-sig") as file:
            for row in csv.DictReader(file):
                row["user_id"] = row.get("user_id") or DEFAULT_USER
                db.execute("""INSERT OR IGNORE INTO components
                    (id,user_id,name,category,nominal,package,manufacturer,article,note,created_at)
                    VALUES (:id,:user_id,:name,:category,:nominal,:package,:manufacturer,:article,:note,:created_at)""", row)
        inventory = os.path.join(IMPORT_DIR, "inventory_rows.csv")
        if os.path.exists(inventory):
            with open(inventory, newline="", encoding="utf-8-sig") as file:
                for row in csv.DictReader(file):
                    row["user_id"] = row.get("user_id") or DEFAULT_USER
                    db.execute("""INSERT OR IGNORE INTO inventory
                        (id,user_id,component_id,location,quantity,created_at)
                        VALUES (:id,:user_id,:component_id,:location,:quantity,:created_at)""", row)
        organizers = os.path.join(IMPORT_DIR, "organizers_rows.csv")
        if os.path.exists(organizers):
            with open(organizers, newline="", encoding="utf-8-sig") as file:
                for row in csv.DictReader(file):
                    row["user_id"] = row.get("user_id") or DEFAULT_USER
                    db.execute("""INSERT OR IGNORE INTO organizers
                        (id,user_id,name,rows,created_at)
                        VALUES (:id,:user_id,:name,:rows,:created_at)""", row)


def rows(query, args=()):
    with connection() as db:
        return [dict(row) for row in db.execute(query, args).fetchall()]


def backup_database():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    target = os.path.join(BACKUP_DIR, f"warehouse-{stamp}.db")
    source = sqlite3.connect(DB_PATH)
    destination = sqlite3.connect(target)
    with destination:
        source.backup(destination)
    destination.close()
    source.close()
    files = sorted((os.path.join(BACKUP_DIR, name) for name in os.listdir(BACKUP_DIR)), reverse=True)
    for old in files[BACKUP_RETENTION:]:
        if os.path.isfile(old):
            os.remove(old)
    return target


def backup_loop():
    while BACKUP_INTERVAL:
        time.sleep(BACKUP_INTERVAL * 3600)
        try:
            backup_database()
        except Exception as error:
            print(f"Automatic backup failed: {error}", flush=True)


def export_data():
    return {
        "format": "warehouse-export",
        "version": 1,
        "exported_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "components": rows("SELECT * FROM components ORDER BY name COLLATE NOCASE"),
        "inventory": rows("SELECT * FROM inventory ORDER BY location COLLATE NOCASE"),
        "organizers": rows("SELECT * FROM organizers ORDER BY created_at"),
    }


def import_data(data):
    required = ("components", "inventory", "organizers")
    if data.get("format") != "warehouse-export" or any(not isinstance(data.get(key), list) for key in required):
        raise ValueError("Неверный формат файла экспорта")
    component_ids = {item.get("id") for item in data["components"]}
    if any(item.get("component_id") not in component_ids for item in data["inventory"]):
        raise ValueError("В наличии есть ссылка на отсутствующий компонент")
    with connection() as db:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("DELETE FROM inventory")
        db.execute("DELETE FROM organizers")
        db.execute("DELETE FROM components")
        for item in data["components"]:
            db.execute("""INSERT INTO components
              (id,user_id,name,category,nominal,package,manufacturer,article,note,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)""", tuple(item.get(key) for key in ("id", "user_id", "name", "category", "nominal", "package", "manufacturer", "article", "note", "created_at")))
        for item in data["inventory"]:
            db.execute("""INSERT INTO inventory
              (id,user_id,component_id,location,quantity,created_at)
              VALUES (?,?,?,?,?,?)""", tuple(item.get(key) for key in ("id", "user_id", "component_id", "location", "quantity", "created_at")))
        for item in data["organizers"]:
            organizer_rows = item.get("rows")
            if isinstance(organizer_rows, str):
                organizer_rows = json.loads(organizer_rows)
            db.execute("""INSERT INTO organizers
              (id,user_id,name,rows,created_at) VALUES (?,?,?,?,?)""", (item.get("id"), item.get("user_id"), item.get("name"), json.dumps(organizer_rows, ensure_ascii=False), item.get("created_at")))


class Handler(SimpleHTTPRequestHandler):
    def json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    def respond(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = urlparse(self.path).path
        try:
            if path == "/api/export":
                return self.do_GET_export()
            if path == "/api/components":
                return self.respond(rows("SELECT * FROM components ORDER BY name COLLATE NOCASE"))
            if path == "/api/inventory":
                return self.respond(rows("SELECT * FROM inventory ORDER BY location COLLATE NOCASE"))
            if path == "/api/organizers":
                result = rows("SELECT id,user_id,name,rows,created_at FROM organizers ORDER BY created_at")
                for item in result:
                    item["rows"] = json.loads(item["rows"])
                return self.respond(result)
            return super().do_GET()
        except Exception as error:
            self.respond({"error": str(error)}, 500)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/restore":
            try:
                length = int(self.headers.get("Content-Length", 0))
                upload_path = f"{DB_PATH}.restore-upload"
                with open(upload_path, "wb") as upload:
                    upload.write(self.rfile.read(length))
                check = sqlite3.connect(upload_path)
                tables = {row[0] for row in check.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                check.close()
                required = {"components", "inventory", "organizers"}
                if not required.issubset(tables):
                    raise ValueError("Файл не является базой Warehouse")
                if os.path.exists(DB_PATH):
                    backup_database()
                os.replace(upload_path, DB_PATH)
                return self.respond({"ok": True})
            except Exception as error:
                if os.path.exists(f"{DB_PATH}.restore-upload"):
                    os.remove(f"{DB_PATH}.restore-upload")
                return self.respond({"error": str(error)}, 400)
        body = self.json_body()
        try:
            if path == "/api/components":
                item_id = str(uuid.uuid4())
                with connection() as db:
                    db.execute("""INSERT INTO components
                      (id,user_id,name,category,nominal,package,manufacturer,article,note,created_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?)""", (item_id, DEFAULT_USER, body.get("name", ""), body.get("category", ""), body.get("nominal", ""), body.get("package", ""), body.get("manufacturer", ""), body.get("article", ""), body.get("note", ""), dt.datetime.now().isoformat()))
                return self.respond({"id": item_id}, 201)
            if path == "/api/inventory":
                with connection() as db:
                    existing = db.execute("SELECT id FROM inventory WHERE user_id=? AND component_id=? AND location=?", (DEFAULT_USER, body.get("component_id"), body.get("location", ""))).fetchone()
                    if existing:
                        db.execute("UPDATE inventory SET quantity=? WHERE id=?", (body.get("quantity", 0), existing[0]))
                        return self.respond({"id": existing[0]})
                    item_id = str(uuid.uuid4())
                    db.execute("INSERT INTO inventory (id,user_id,component_id,location,quantity,created_at) VALUES (?,?,?,?,?,?)", (item_id, DEFAULT_USER, body.get("component_id"), body.get("location", ""), body.get("quantity", 0), dt.datetime.now().isoformat()))
                return self.respond({"id": item_id}, 201)
            if path == "/api/import":
                backup_database()
                import_data(body)
                return self.respond({"components": len(body["components"]), "inventory": len(body["inventory"]), "organizers": len(body["organizers"])})
            if path == "/api/backup":
                return self.respond({"file": backup_database()})
            self.respond({"error": "Not found"}, 404)
        except Exception as error:
            self.respond({"error": str(error)}, 400)

    def do_PUT(self):
        path = urlparse(self.path).path
        body = self.json_body()
        try:
            parts = path.strip("/").split("/")
            if parts[:2] == ["api", "components"] and len(parts) == 3:
                fields = ["name", "category", "nominal", "package", "manufacturer", "article", "note"]
                values = [body.get(field, "") for field in fields]
                with connection() as db:
                    db.execute(f"UPDATE components SET {','.join(f'{field}=?' for field in fields)} WHERE id=?", values + [parts[2]])
                return self.respond({"ok": True})
            if parts[:2] == ["api", "inventory"] and len(parts) == 3:
                with connection() as db:
                    db.execute("UPDATE inventory SET quantity=? WHERE id=?", (body.get("quantity", 0), parts[2]))
                return self.respond({"ok": True})
            if path == "/api/organizers":
                with connection() as db:
                    for item in body:
                        db.execute("""INSERT INTO organizers (id,user_id,name,rows,created_at) VALUES (?,?,?,?,?)
                          ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name, rows=excluded.rows""", (item["id"], DEFAULT_USER, item["name"], json.dumps(item["rows"], ensure_ascii=False), dt.datetime.now().isoformat()))
                return self.respond({"ok": True})
            self.respond({"error": "Not found"}, 404)
        except Exception as error:
            self.respond({"error": str(error)}, 400)

    def do_GET_export(self):
        raw = json.dumps(export_data(), ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Disposition", "attachment; filename=warehouse-export.json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_DELETE(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        try:
            if len(parts) == 3 and parts[0] == "api":
                table = {"components": "components", "inventory": "inventory", "organizers": "organizers"}.get(parts[1])
                if table:
                    with connection() as db:
                        db.execute(f"DELETE FROM {table} WHERE id=?", (parts[2],))
                    return self.respond({"ok": True})
            self.respond({"error": "Not found"}, 404)
        except Exception as error:
            self.respond({"error": str(error)}, 400)


if __name__ == "__main__":
    os.chdir(STATIC_DIR)
    init_db()
    if BACKUP_INTERVAL:
        threading.Thread(target=backup_loop, daemon=True).start()
    print(f"Warehouse listening on 0.0.0.0:8099, database: {DB_PATH}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", 8099), Handler).serve_forever()

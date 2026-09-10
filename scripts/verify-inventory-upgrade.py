"""Verify the inventory migration in an empty, dedicated local PostgreSQL DB."""
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import unquote, urlparse

url = urlparse(os.environ.get("INVENTORY_UPGRADE_TEST_DATABASE_URL", ""))
if url.hostname not in {"127.0.0.1", "localhost", "::1"} or url.path != "/inventory_upgrade_test":
    raise SystemExit("Set INVENTORY_UPGRADE_TEST_DATABASE_URL to a dedicated local inventory_upgrade_test DB")
env = {**os.environ}
if url.password:
    env["PGPASSWORD"] = unquote(url.password)
command = ["psql", "-X", "-h", url.hostname, "-p", str(url.port or 5432), "-d", "inventory_upgrade_test", "-v", "ON_ERROR_STOP=1", "-tA"]
if url.username:
    command += ["-U", unquote(url.username)]

def sql(statement):
    return subprocess.check_output(command + ["-c", statement], text=True, env=env).strip()

if sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public'") != "0":
    raise SystemExit("Refusing nonempty test database; create a new empty inventory_upgrade_test database")

root = Path(__file__).resolve().parents[1]
target = root / "prisma/migrations/20260909000000_inventory_discovery/migration.sql"
for migration in sorted((root / "prisma/migrations").glob("*/migration.sql")):
    if migration >= target:
        break
    subprocess.run(command + ["-f", str(migration)], env=env, stdout=subprocess.DEVNULL, check=True)

sql('''INSERT INTO site(id,name,"updatedAt") VALUES ('site','Existing DC',now());
INSERT INTO rack(id,name,"heightU","siteId","updatedAt") VALUES ('rack','Existing rack',42,'site',now());
INSERT INTO device_stack(id,name) VALUES ('stack','Existing stack');
INSERT INTO device(id,name,"serialNumber","assetTag",vendor,model,"heightU","rackId","rackPosition","device_stack_id","stack_member","stack_role","updatedAt")
SELECT 'existing-'||i,'switch-'||i,'SERIAL-'||i,'ASSET-'||i,'User vendor','Existing model',1,
CASE WHEN i<=3 THEN 'rack' ELSE NULL END, CASE WHEN i<=3 THEN i ELSE NULL END,
CASE WHEN i<=3 THEN 'stack' ELSE NULL END, CASE WHEN i<=3 THEN i ELSE NULL END,
CASE WHEN i=1 THEN 'MASTER'::"StackRole" WHEN i<=3 THEN 'MEMBER'::"StackRole" ELSE NULL END,now()
FROM generate_series(1,500) i;
INSERT INTO legacy_device(id,site,"siteKey",hostname,"hostnameKey","managementIp","deviceType",model,"serialNumber","softwareVersion","createdAt","updatedAt")
VALUES ('legacy','DC','dc','switch','switch','192.0.2.5','ios','C9300','SERIAL-1','accepted-version','2026-09-01',now());
INSERT INTO legacy_ingest_receipt(id,"runId","deviceId",feature,"collectedAt","payloadHash")
VALUES ('receipt','run','legacy','health','2026-09-09 02:00:00','test');''')
query = "SELECT row_to_json(d)::text FROM device d ORDER BY id"
before = [json.loads(row) for row in sql(query).splitlines()]
legacy_before = json.loads(sql("SELECT row_to_json(d)::text FROM legacy_device d"))
subprocess.run(command + ["-f", str(target)], env=env, stdout=subprocess.DEVNULL, check=True)
after = [json.loads(row) for row in sql(query).splitlines()]
for row in after:
    assert row.pop("version") is None
assert before == after, "An existing asset field changed during migration"
assert sql("SELECT count(*) FROM inventory_source") == "0", "Migration unexpectedly created source links"
legacy_after = json.loads(sql("SELECT row_to_json(d)::text FROM legacy_device d"))
clock = legacy_after.pop("inventoryMetadataClock")
assert legacy_after.pop("inventoryRevision") == 0
assert legacy_after.pop("inventoryMetadataConflict") is None
assert legacy_before == legacy_after
assert clock["softwareVersion"]["at"] == "2026-09-09T02:00:00.000Z"
print("PASS: 500 existing assets preserved, zero automatic links, Legacy ordering baseline initialized without changing observations.")

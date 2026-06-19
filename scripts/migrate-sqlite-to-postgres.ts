import { PrismaClient as PgClient, Prisma } from '@prisma/client'
import { PrismaClient as SqliteClient } from '../prisma/generated/sqlite'

const CHUNK = 1000
const pg = new PgClient()
const sqlite = new SqliteClient()

async function copyTable<R>(
  label: string,
  read: () => Promise<R[]>,
  write: (rows: R[]) => Promise<{ count: number }>,
  count: () => Promise<number>,
): Promise<void> {
  const existing = await count()
  if (existing > 0) {
    throw new Error(
      `Destination "${label}" already has ${existing} rows. Aborting to avoid duplicate import.`,
    )
  }

  const rows = await read()
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK))
  }

  const dst = await count()
  if (dst !== rows.length) {
    throw new Error(`Row-count mismatch for "${label}": source ${rows.length}, destination ${dst}`)
  }

  console.log(`copied ${label}: ${rows.length} rows`)
}

async function main() {
  // FK-safe order: parents before children.
  await copyTable(
    'user',
    () => sqlite.user.findMany(),
    rows => pg.user.createMany({ data: rows as Prisma.UserCreateManyInput[] }),
    () => pg.user.count(),
  )
  await copyTable(
    'verification',
    () => sqlite.verification.findMany(),
    rows => pg.verification.createMany({ data: rows as Prisma.VerificationCreateManyInput[] }),
    () => pg.verification.count(),
  )
  await copyTable(
    'apicHost',
    () => sqlite.apicHost.findMany(),
    rows => pg.apicHost.createMany({ data: rows as Prisma.ApicHostCreateManyInput[] }),
    () => pg.apicHost.count(),
  )

  await copyTable(
    'session',
    () => sqlite.session.findMany(),
    rows => pg.session.createMany({ data: rows as Prisma.SessionCreateManyInput[] }),
    () => pg.session.count(),
  )
  await copyTable(
    'account',
    () => sqlite.account.findMany(),
    rows => pg.account.createMany({ data: rows as Prisma.AccountCreateManyInput[] }),
    () => pg.account.count(),
  )

  await copyTable(
    'endpoint',
    () => sqlite.endpoint.findMany(),
    rows => pg.endpoint.createMany({ data: rows as Prisma.EndpointCreateManyInput[] }),
    () => pg.endpoint.count(),
  )
  await copyTable(
    'interfaceSnapshot',
    () => sqlite.interfaceSnapshot.findMany(),
    rows => pg.interfaceSnapshot.createMany({ data: rows as Prisma.InterfaceSnapshotCreateManyInput[] }),
    () => pg.interfaceSnapshot.count(),
  )
  await copyTable(
    'faultSnapshot',
    () => sqlite.faultSnapshot.findMany(),
    rows => pg.faultSnapshot.createMany({ data: rows as Prisma.FaultSnapshotCreateManyInput[] }),
    () => pg.faultSnapshot.count(),
  )
  await copyTable(
    'faultCountSample',
    () => sqlite.faultCountSample.findMany(),
    rows => pg.faultCountSample.createMany({ data: rows as Prisma.FaultCountSampleCreateManyInput[] }),
    () => pg.faultCountSample.count(),
  )
  await copyTable(
    'healthScoreSnapshot',
    () => sqlite.healthScoreSnapshot.findMany(),
    rows => pg.healthScoreSnapshot.createMany({ data: rows as Prisma.HealthScoreSnapshotCreateManyInput[] }),
    () => pg.healthScoreSnapshot.count(),
  )
  await copyTable(
    'healthScoreSample',
    () => sqlite.healthScoreSample.findMany(),
    rows => pg.healthScoreSample.createMany({ data: rows as Prisma.HealthScoreSampleCreateManyInput[] }),
    () => pg.healthScoreSample.count(),
  )
  await copyTable(
    'nodeSnapshot',
    () => sqlite.nodeSnapshot.findMany(),
    rows => pg.nodeSnapshot.createMany({ data: rows as Prisma.NodeSnapshotCreateManyInput[] }),
    () => pg.nodeSnapshot.count(),
  )
  await copyTable(
    'hardwareComponent',
    () => sqlite.hardwareComponent.findMany(),
    rows => pg.hardwareComponent.createMany({ data: rows as Prisma.HardwareComponentCreateManyInput[] }),
    () => pg.hardwareComponent.count(),
  )
  await copyTable(
    'nodeStatusSample',
    () => sqlite.nodeStatusSample.findMany(),
    rows => pg.nodeStatusSample.createMany({ data: rows as Prisma.NodeStatusSampleCreateManyInput[] }),
    () => pg.nodeStatusSample.count(),
  )

  await copyTable(
    'interfaceSample',
    () => sqlite.interfaceSample.findMany(),
    rows => pg.interfaceSample.createMany({ data: rows as Prisma.InterfaceSampleCreateManyInput[] }),
    () => pg.interfaceSample.count(),
  )

  await copyTable(
    'auditLog',
    () => sqlite.auditLog.findMany(),
    rows => pg.auditLog.createMany({ data: rows as Prisma.AuditLogCreateManyInput[] }),
    () => pg.auditLog.count(),
  )

  console.log('Migration complete.')
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await pg.$disconnect()
    await sqlite.$disconnect()
  })

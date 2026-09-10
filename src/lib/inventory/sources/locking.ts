import type { Prisma } from '@prisma/client'

/** All inventory asset/source writers share this transaction lock. Ingestion never takes it.
 * A single lock also orders multi-device CSV/stack edits without lock inversions.
 * Take source row locks before this lock when adopting; workers do not lock sources.
 */
export async function lockInventory(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(721460901)`
}
export async function assertStackCanBecomeEmpty(tx: Prisma.TransactionClient, id: string) {
  if (await tx.inventorySource.findUnique({ where: { deviceStackId: id } })) {
    throw new Error('Unlink the stack source before removing its last member.')
  }
}

export async function assertAvailableSerial(
  tx: Prisma.TransactionClient,
  serial: string,
  exceptId = '',
) {
  const key = serial.trim().toLocaleLowerCase('en-US')
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM device WHERE lower(trim("serialNumber")) = ${key} AND id <> ${exceptId}`
  if (rows.length) throw new Error('Another inventory asset has this serial number.')
}

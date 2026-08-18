import { auth } from "../src/lib/auth"
import { prisma } from "../src/lib/prisma"

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim()
  const password = process.env.ADMIN_PASSWORD

  if (!username || !password) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required")
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters")
  }

  const email = `${username}@local.test`

  // This runs on every container start, so it must be idempotent: an existing admin is
  // a no-op, not a failure. Exiting non-zero here would break the startup chain and
  // leave the app unable to boot a second time.
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    console.log(`Admin user already present: ${username}`)
    return
  }

  await auth.api.createUser({
    body: {
      email,
      name: username,
      password,
      role: "admin",
      data: {
        username,
        displayUsername: username,
      },
    },
  })

  console.log(`Created admin user: ${username}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

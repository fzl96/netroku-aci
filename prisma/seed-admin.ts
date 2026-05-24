import { auth } from "../src/lib/auth"

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim()
  const password = process.env.ADMIN_PASSWORD

  if (!username || !password) {
    throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD are required")
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters")
  }

  await auth.api.createUser({
    body: {
      email: `${username}@local.test`,
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

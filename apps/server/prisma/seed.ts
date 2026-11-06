import { prisma } from '../src/db.js'
import { seedProblems } from '../src/problems/seed.js'

const n = await seedProblems()
console.log(`seeded ${n} problems`)
await prisma.$disconnect()

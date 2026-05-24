import { syncBookings } from "../lib/sync";
import { prisma } from "../lib/prisma";

const start = process.env.START_DATE;
const end = process.env.END_DATE;
try {
  console.log(await syncBookings(start, end));
} finally {
  await prisma.$disconnect();
}

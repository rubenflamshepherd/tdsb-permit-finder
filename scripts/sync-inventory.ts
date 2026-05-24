import { syncInventory } from "../lib/sync";
import { prisma } from "../lib/prisma";

const permitTypeId = Number(process.env.PERMIT_TYPE_ID ?? 3);
try {
  console.log(await syncInventory(permitTypeId));
} finally {
  await prisma.$disconnect();
}

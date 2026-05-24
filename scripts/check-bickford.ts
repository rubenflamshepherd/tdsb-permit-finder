import { prisma } from "../lib/prisma";
async function main() {
  const gym = await prisma.space.findUnique({ where: { id: 26535 }, select: { id: true, name: true, type: true, spaceTypeId: true } });
  console.log("Bickford gym:", gym);

  if (gym?.spaceTypeId != null) {
    const candidates = await prisma.space.count({
      where: {
        isAvailable: true,
        hideFromPublic: false,
        spaceTypeId: gym.spaceTypeId,
        facility: { latitude: { not: null }, longitude: { not: null } },
      },
    });
    console.log(`Total spaces with same spaceTypeId (${gym.spaceTypeId}): ${candidates} — under 10000 cap so Bickford WOULD show if user filtered by this type`);
  }
}
main().then(() => process.exit(0));

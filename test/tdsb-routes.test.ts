import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  space: { findUnique: vi.fn() },
  spaceType: { findMany: vi.fn() },
  facility: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ getPrisma: async () => prisma }));

const tdsbFetch = vi.fn();
vi.stubGlobal("fetch", tdsbFetch);

const { GET: getSpacePictures } = await import("../app/api/space-pictures/[id]/route");
const { GET: getSpaceTypes } = await import("../app/api/space-types/route");
const { GET: getFacilities } = await import("../app/api/facilities/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/space-pictures/[id]", () => {
  it("serves picture URLs from the synced space row", async () => {
    prisma.space.findUnique.mockResolvedValue({ pictureFilenames: ["10614.jpeg", "10615.jpeg"] });

    const response = await getSpacePictures(new Request("http://localhost"), params("85"));

    expect(prisma.space.findUnique).toHaveBeenCalledWith({ where: { id: 85 }, select: { pictureFilenames: true } });
    expect(await response.json()).toEqual({
      pictureUrls: [
        "https://tdsb.ebasefm.com/user_content/cu/pictures/10614.jpeg",
        "https://tdsb.ebasefm.com/user_content/cu/pictures/10615.jpeg",
      ],
    });
    expect(tdsbFetch).not.toHaveBeenCalled();
  });

  it("returns no pictures for a space without synced pictures", async () => {
    prisma.space.findUnique.mockResolvedValue(null);

    const response = await getSpacePictures(new Request("http://localhost"), params("85"));

    expect(await response.json()).toEqual({ pictureUrls: [] });
    expect(tdsbFetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid space id", async () => {
    const response = await getSpacePictures(new Request("http://localhost"), params("abc"));

    expect(response.status).toBe(400);
  });
});

describe("GET /api/space-types", () => {
  it("serves only synced rows, even when the table is empty", async () => {
    prisma.spaceType.findMany.mockResolvedValue([]);

    const response = await getSpaceTypes();

    expect(await response.json()).toEqual([]);
    expect(tdsbFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/facilities", () => {
  it("serves only synced rows, even when the table is empty", async () => {
    prisma.facility.findMany.mockResolvedValue([]);

    const response = await getFacilities();

    expect(await response.json()).toEqual([]);
    expect(tdsbFetch).not.toHaveBeenCalled();
  });
});

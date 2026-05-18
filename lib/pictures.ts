const PICTURE_BASE_URL = process.env.TDSB_PICTURE_BASE_URL ?? "https://tdsb.ebasefm.com/user_content/cu/pictures";

export function facilityPictureUrls(filenames: unknown): string[] {
  if (!Array.isArray(filenames)) return [];
  return filenames
    .filter((name): name is string => typeof name === "string" && name.length > 0)
    .map((name) => `${PICTURE_BASE_URL}/${name}`);
}

export function facilityPictureUrl(filenames: unknown): string | null {
  return facilityPictureUrls(filenames)[0] ?? null;
}

const BASE_URL = process.env.TDSB_BASE_URL ?? "https://tdsb.ebasefm.com";
const TIMEOUT_MS = Number(process.env.TDSB_TIMEOUT_MS ?? 15000);

function requestOptions(init: RequestInit = {}): RequestInit {
  return { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) };
}

export type TdsbSpaceType = { id: string; name: string; request_by_qty?: string };
export type TdsbFacility = {
  id: number; name: string; address?: string; suite?: string; city?: string; province?: string;
  postal_code?: string; phone?: string; region_id?: number; region?: string; latitude?: number; longitude?: number; hours?: string;
};
export type TdsbSpace = {
  id: string; name: string; space_type_id?: string; school_id: string; type?: string; is_available?: string;
  is_available_reg?: string; hide_from_public?: string; hours?: string | null;
};
export type TdsbBooking = {
  id: string; school_id: string; start: string; end: string; status_id?: number | string; purpose?: string; spaces?: string;
  [key: string]: unknown;
};
export type TdsbSpecialDate = {
  id: string; reason?: string; start: string; end: string; identifiers?: string[]; [key: string]: unknown;
};
export type TdsbSpaceDetails = {
  pictureFilenames: string[];
  attributes: Record<string, string>;
  areaSqm: number | null;
  areaSqft: number | null;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`TDSB request failed ${response.status}: ${response.url}`);
  return (await response.json()) as T;
}

async function readText(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`TDSB request failed ${response.status}: ${response.url}`);
  return response.text();
}

const FILENAMES_RE = /var\s+fileNames\s*=\s*\[([^\]]*)\]/;
const STRING_LITERAL_RE = /"([^"]*)"|'([^']*)'/g;
const SAFE_FILENAME_RE = /^[A-Za-z0-9._-]+\.(jpe?g|png|gif|webp)$/i;
const ATTRIBUTES_TABLE_RE = /<legend>\s*Attributes\s*<\/legend>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i;
const TABLE_ROW_RE = /<tr>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi;

function decodeHtmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCataloguePictureFilenames(html: string): string[] {
  const match = FILENAMES_RE.exec(html);
  if (!match) return [];
  const filenames: string[] = [];
  for (const literal of match[1].matchAll(STRING_LITERAL_RE)) {
    const value = literal[1] ?? literal[2] ?? "";
    if (SAFE_FILENAME_RE.test(value)) filenames.push(value);
  }
  return filenames;
}

export function parseSpaceDetailAttributes(html: string): Record<string, string> {
  const table = ATTRIBUTES_TABLE_RE.exec(html);
  if (!table) return {};

  const attributes: Record<string, string> = {};
  for (const row of table[1].matchAll(TABLE_ROW_RE)) {
    const key = decodeHtmlText(row[1]);
    const value = decodeHtmlText(row[2]);
    if (key) attributes[key] = value;
  }
  return attributes;
}

export function parseTotalSquareFootage(value?: string): { areaSqm: number | null; areaSqft: number | null } {
  const areaSqm = Number(value?.match(/([\d,.]+)\s*sqm/i)?.[1]?.replace(/,/g, "") ?? NaN);
  const areaSqft = Number(value?.match(/([\d,.]+)\s*sqft/i)?.[1]?.replace(/,/g, "") ?? NaN);
  return {
    areaSqm: Number.isFinite(areaSqm) ? areaSqm : null,
    areaSqft: Number.isFinite(areaSqft) ? Math.round(areaSqft) : null,
  };
}

export function parseSpaceDetails(html: string): TdsbSpaceDetails {
  const attributes = parseSpaceDetailAttributes(html);
  const { areaSqm, areaSqft } = parseTotalSquareFootage(attributes["Total Square Footage"]);
  return {
    pictureFilenames: parseCataloguePictureFilenames(html),
    attributes,
    areaSqm,
    areaSqft,
  };
}

export class TdsbClient {
  constructor(private readonly baseUrl = BASE_URL) {}

  async spaceTypes(permitTypeId = 3): Promise<TdsbSpaceType[]> {
    const url = new URL("/cu/api/space_types/fetch_available", this.baseUrl);
    url.searchParams.set("permit_type_id", String(permitTypeId));
    return readJson<TdsbSpaceType[]>(await fetch(url, requestOptions({ cache: "no-store" })));
  }

  async facilities(permitTypeId = 3): Promise<TdsbFacility[]> {
    const url = new URL("/cu/api/schools/search_available", this.baseUrl);
    url.searchParams.set("is_admin", "0");
    url.searchParams.set("permit_type_id", String(permitTypeId));
    url.searchParams.set("user_id", "0");
    return readJson<TdsbFacility[]>(await fetch(url, requestOptions({ cache: "no-store" })));
  }

  async spaces(schoolId: number, availableOnly = true): Promise<TdsbSpace[]> {
    const body = new URLSearchParams({ school_id: String(schoolId), available_only: String(availableOnly) });
    return readJson<TdsbSpace[]>(await fetch(new URL("/rentals/xhr/spaces/fetch", this.baseUrl), requestOptions({
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    })));
  }

  async bookings(schoolId: number, startDate: string, endDate: string, spaceId = 0): Promise<TdsbBooking[]> {
    const url = new URL("/rentals/bookings/get", this.baseUrl);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("filters[filter_type]", "facility");
    url.searchParams.set("filters[school_id]", String(schoolId));
    url.searchParams.set("filters[space_id]", String(spaceId));
    return readJson<TdsbBooking[]>(await fetch(url, requestOptions({ cache: "no-store" })));
  }

  async specialDates(schoolId: number, startDate: string, endDate: string): Promise<TdsbSpecialDate[]> {
    const url = new URL("/cu/special_dates/get", this.baseUrl);
    url.searchParams.set("start_date", startDate);
    url.searchParams.set("end_date", endDate);
    url.searchParams.set("school_id", String(schoolId));
    return readJson<TdsbSpecialDate[]>(await fetch(url, requestOptions({ cache: "no-store" })));
  }

  async facilityPictures(schoolId: number): Promise<string[]> {
    const url = new URL(`/rentals/catalogue/school_details/${schoolId}`, this.baseUrl);
    const html = await readText(await fetch(url, requestOptions({ cache: "no-store" })));
    return parseCataloguePictureFilenames(html);
  }

  async spacePictures(spaceId: number): Promise<string[]> {
    const url = new URL(`/rentals/catalogue/space_details/${spaceId}`, this.baseUrl);
    const html = await readText(await fetch(url, requestOptions({ cache: "no-store" })));
    return parseCataloguePictureFilenames(html);
  }

  async spaceDetails(spaceId: number): Promise<TdsbSpaceDetails> {
    const url = new URL(`/rentals/catalogue/space_details/${spaceId}`, this.baseUrl);
    const html = await readText(await fetch(url, requestOptions({ cache: "no-store" })));
    return parseSpaceDetails(html);
  }
}

export type SpaceType = { id: number | string; name: string };

export type NearbyPoint = { lat: number; lng: number };

export type NearbyForm = {
  startDate: string;
  startTime: string;
  endTime: string;
  weeks: number;
  limit: number;
  point: NearbyPoint;
};

import type { Coordinates } from "./place-repository";

export type PoiCandidate = {
  provider: "amap";
  poiId: string;
  name: string;
  branchName?: string;
  address?: string;
  city?: string;
  district?: string;
  coordinates: Coordinates;
};

/** AMap owns POI identity and location; Foodprint owns experience data. */
export interface PoiSearchProvider {
  search(input: { keyword: string; city?: string; around?: Coordinates }): Promise<PoiCandidate[]>;
}

import type { PlaceSummary } from "./place-repository";

export type RatingValue = 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

export type CreateFirstMarkInput = {
  groupId: string;
  userId: string;
  source: {
    provider: "amap" | "manual";
    poiId?: string;
    name: string;
    address?: string;
    latitude: number;
    longitude: number;
    coordinateSystem: "GCJ-02" | "WGS84";
  };
  primaryCategory: string;
  overallRating: RatingValue;
  wouldRecommend: true;
  experienceAttested: true;
};

/**
 * The implementation must use one database transaction for the first place,
 * its group relation, its first mark and its first visit.
 */
export interface MarkRepository {
  createFirstMark(input: CreateFirstMarkInput): Promise<PlaceSummary>;
  addOrUpdateMark(input: {
    groupPlaceId: string;
    userId: string;
    overallRating: RatingValue;
    wouldRecommend: boolean;
    experienceAttested: true;
  }): Promise<void>;
  deleteOwnMark(input: { groupPlaceId: string; userId: string }): Promise<void>;
}

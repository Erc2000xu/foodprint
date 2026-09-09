export const parkingGeometryTypes = ["point", "line", "area"] as const;
export type ParkingGeometryType = (typeof parkingGeometryTypes)[number];

export type ParkingCoordinate = [number, number];
export type ParkingCoordinates = ParkingCoordinate | ParkingCoordinate[];

export type ParkingViewport = {
  center: ParkingCoordinate;
  zoom: number;
};

export type ParkingMark = {
  id: string;
  groupId: string;
  createdBy: string;
  creatorDisplayName: string;
  geometryType: ParkingGeometryType;
  coordinates: ParkingCoordinates;
  coordinateSystem: "GCJ-02";
  name: string | null;
  displayName: string;
  isConvenient: true;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

export type ParkingAccess = {
  enabled: boolean;
  canUse: boolean;
  canManage: boolean;
  authorizedCount: number;
};

export type ParkingMember = {
  userId: string;
  displayName: string;
  email: string;
  role: "owner" | "admin" | "member";
  parkingGranted: boolean;
  grantedAt: string | null;
};

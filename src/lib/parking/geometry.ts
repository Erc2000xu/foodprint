import type { ParkingCoordinate, ParkingCoordinates, ParkingGeometryType } from "@/lib/parking/types";

export const PARKING_MAX_NODES = 100;
const EARTH_RADIUS_METERS = 6_371_000;
const EPSILON = 1e-9;

function asCoordinate(value: unknown): ParkingCoordinate | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return [longitude, latitude];
}

function sameCoordinate(left: ParkingCoordinate, right: ParkingCoordinate) {
  return Math.abs(left[0] - right[0]) <= EPSILON && Math.abs(left[1] - right[1]) <= EPSILON;
}

function cross(a: ParkingCoordinate, b: ParkingCoordinate, c: ParkingCoordinate) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a: ParkingCoordinate, b: ParkingCoordinate, point: ParkingCoordinate) {
  return Math.abs(cross(a, b, point)) <= EPSILON
    && point[0] >= Math.min(a[0], b[0]) - EPSILON
    && point[0] <= Math.max(a[0], b[0]) + EPSILON
    && point[1] >= Math.min(a[1], b[1]) - EPSILON
    && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}

export function segmentsIntersect(a: ParkingCoordinate, b: ParkingCoordinate, c: ParkingCoordinate, d: ParkingCoordinate) {
  const crossAB_C = cross(a, b, c);
  const crossAB_D = cross(a, b, d);
  const crossCD_A = cross(c, d, a);
  const crossCD_B = cross(c, d, b);
  return (Math.abs(crossAB_C) <= EPSILON && onSegment(a, b, c))
    || (Math.abs(crossAB_D) <= EPSILON && onSegment(a, b, d))
    || (Math.abs(crossCD_A) <= EPSILON && onSegment(c, d, a))
    || (Math.abs(crossCD_B) <= EPSILON && onSegment(c, d, b))
    || ((crossAB_C > EPSILON && crossAB_D < -EPSILON || crossAB_C < -EPSILON && crossAB_D > EPSILON)
      && (crossCD_A > EPSILON && crossCD_B < -EPSILON || crossCD_A < -EPSILON && crossCD_B > EPSILON));
}

function hasSelfIntersection(points: ParkingCoordinate[], closed: boolean) {
  const segmentCount = closed ? points.length - 1 : points.length - 1;
  for (let first = 0; first < segmentCount; first += 1) {
    for (let second = first + 1; second < segmentCount; second += 1) {
      if (second === first + 1 || (closed && first === 0 && second === segmentCount - 1)) continue;
      if (segmentsIntersect(points[first], points[first + 1], points[second], points[second + 1])) return true;
    }
  }
  return false;
}

function polygonArea(points: ParkingCoordinate[]) {
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    area += points[index][0] * points[index + 1][1] - points[index + 1][0] * points[index][1];
  }
  return Math.abs(area) / 2;
}

export type ParkingGeometryValidation =
  | { ok: true; coordinates: ParkingCoordinates }
  | { ok: false; error: string };

export function normalizeParkingGeometry(type: ParkingGeometryType, value: unknown): ParkingGeometryValidation {
  if (type === "point") {
    const point = asCoordinate(value);
    return point ? { ok: true, coordinates: point } : { ok: false, error: "请选择一个有效的停车点。" };
  }

  if (!Array.isArray(value)) return { ok: false, error: type === "line" ? "路段至少需要两个节点。" : "区域至少需要三个节点。" };
  const points = value.map(asCoordinate);
  if (points.some((point): point is null => point === null)) return { ok: false, error: "位置坐标无效，请重新选点。" };
  const normalizedPoints = points as ParkingCoordinate[];
  const openPoints = type === "area" && normalizedPoints.length > 1 && sameCoordinate(normalizedPoints[0], normalizedPoints.at(-1)!)
    ? normalizedPoints.slice(0, -1)
    : normalizedPoints;
  if (openPoints.length > PARKING_MAX_NODES) return { ok: false, error: `最多添加 ${PARKING_MAX_NODES} 个节点。` };
  if (type === "line" && openPoints.length < 2) return { ok: false, error: "路段至少需要两个不同节点。" };
  if (type === "area" && openPoints.length < 3) return { ok: false, error: "区域至少需要三个不同节点。" };
  if (openPoints.some((point, index) => index > 0 && sameCoordinate(point, openPoints[index - 1]))) return { ok: false, error: "相邻节点不能重合。" };
  if (new Set(openPoints.map((point) => `${point[0]}:${point[1]}`)).size !== openPoints.length) return { ok: false, error: "节点不能重复。" };

  if (type === "line") {
    if (hasSelfIntersection(openPoints, false)) return { ok: false, error: "路段不能自相交，请重新选点。" };
    return { ok: true, coordinates: openPoints };
  }

  const closed = [...openPoints, openPoints[0]];
  if (polygonArea(closed) <= 1e-10) return { ok: false, error: "区域面积太小或所有节点共线。" };
  if (hasSelfIntersection(closed, true)) return { ok: false, error: "区域边界不能自相交，请重新选点。" };
  return { ok: true, coordinates: closed };
}

export function isParkingGeometryValid(type: ParkingGeometryType, value: unknown): value is ParkingCoordinates {
  return normalizeParkingGeometry(type, value).ok;
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function distanceBetween(left: ParkingCoordinate, right: ParkingCoordinate) {
  const latitudeDelta = toRadians(right[1] - left[1]);
  const longitudeDelta = toRadians(right[0] - left[0]);
  const leftLatitude = toRadians(left[1]);
  const rightLatitude = toRadians(right[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function parkingLengthMeters(type: ParkingGeometryType, coordinates: ParkingCoordinates) {
  if (type === "point") return 0;
  const points = coordinates as ParkingCoordinate[];
  return points.slice(1).reduce((total, point, index) => total + distanceBetween(points[index], point), 0);
}

export function formatParkingLength(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) return "长度待定";
  if (meters < 1000) return `约 ${Math.max(1, Math.round(meters / 10) * 10)} 米`;
  return `约 ${(meters / 1000).toFixed(1)} 公里`;
}

export function parkingGeometryLabel(type: ParkingGeometryType) {
  return type === "point" ? "点" : type === "line" ? "路段" : "区域";
}

export function parkingDefaultName(type: ParkingGeometryType) {
  return type === "point" ? "停车点" : type === "line" ? "路边停车" : "停车区域";
}

export function parkingCoordinatesForPreview(type: ParkingGeometryType, nodes: ParkingCoordinate[]): ParkingCoordinates | undefined {
  if (type === "point") return nodes[0];
  if (nodes.length < 2) return nodes.length ? nodes : undefined;
  if (type === "area" && nodes.length >= 3) return [...nodes, nodes[0]];
  return nodes;
}

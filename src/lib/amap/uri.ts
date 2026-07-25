export type AmapNavigationTarget = {
  name: string;
  address?: string | null;
  longitude?: number | null;
  latitude?: number | null;
};

function validCoordinates(target: AmapNavigationTarget) {
  return Number.isFinite(target.longitude) && Number.isFinite(target.latitude)
    && Math.abs(Number(target.longitude)) <= 180 && Math.abs(Number(target.latitude)) <= 90;
}

/**
 * AMap URI API: on a phone it requests the installed AMap app, and otherwise
 * falls back to the web map. No AMap key or Foodprint user location is exposed.
 */
export function amapNavigationUrl(target: AmapNavigationTarget) {
  const url = new URL(validCoordinates(target) ? "https://uri.amap.com/navigation" : "https://uri.amap.com/search");
  if (validCoordinates(target)) url.searchParams.set("to", `${target.longitude},${target.latitude},${target.name}`);
  else url.searchParams.set("keyword", [target.name, target.address].filter(Boolean).join(" "));
  url.searchParams.set("callnative", "1");
  url.searchParams.set("src", "foodprint");
  return url.toString();
}

export function amapPlaceUrl(target: AmapNavigationTarget) {
  const url = new URL("https://uri.amap.com/search");
  url.searchParams.set("keyword", [target.name, target.address].filter(Boolean).join(" "));
  url.searchParams.set("callnative", "1");
  url.searchParams.set("view", "map");
  url.searchParams.set("src", "foodprint");
  return url.toString();
}

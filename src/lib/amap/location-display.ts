/**
 * Displays the city and district exactly from an AMap POI in two consistent
 * levels. We only remove a duplicated city prefix from the district; we never
 * infer or hard-code a city.
 */
export function displayAmapAdministrativeLocation(city?: string | null, district?: string | null) {
  const cityName = city?.trim() ?? "";
  let districtName = district?.trim() ?? "";
  if (cityName && districtName.startsWith(cityName)) districtName = districtName.slice(cityName.length);
  else if (cityName.endsWith("市") && districtName.startsWith(cityName.slice(0, -1))) districtName = districtName.slice(cityName.length - 1);
  return [cityName, districtName].filter(Boolean).join(" · ");
}

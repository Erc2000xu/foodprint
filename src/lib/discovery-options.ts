export const cuisineOptions = [
  ['beijing_northern', '北京菜/北方菜'], ['cantonese', '粤菜'], ['sichuan_hunan', '川菜/湘菜'],
  ['jiangzhe', '江浙菜/本帮菜'], ['hotpot', '火锅'], ['barbecue', '烧烤'], ['japanese', '日料'],
  ['korean', '韩餐'], ['southeast_asian', '东南亚菜'], ['western', '西餐'], ['quick_bite', '小吃快餐/面食'],
  ['seafood', '海鲜'], ['vegetarian_light', '素食/轻食'], ['coffee_tea', '咖啡/茶饮'], ['dessert_bakery', '甜品/烘焙'],
] as const;

export const beijingQuickAreas = ['王府井', '三里屯', '国贸', '望京', '中关村'];

export const priceOptions = [
  ['under_50', '¥50 以下'], ['50_100', '¥50–100'], ['100_200', '¥100–200'],
  ['200_400', '¥200–400'], ['over_400', '¥400+'],
] as const;

export function priceRangeFor(value: number | null | undefined) {
  if (value === null || value === undefined) return undefined;
  if (value < 50) return 'under_50';
  if (value < 100) return '50_100';
  if (value < 200) return '100_200';
  if (value < 400) return '200_400';
  return 'over_400';
}

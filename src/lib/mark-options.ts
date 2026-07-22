export const categoryOptions = [
  ["restaurant", "餐厅"],
  ["cafe", "咖啡馆"],
  ["drinks", "茶饮/饮品"],
  ["bar", "酒吧 / Pub"],
  ["bakery_dessert", "烘焙 / 甜品"],
  ["street_food", "小吃 / 街头餐饮"],
  ["other_food_drink", "其他餐饮"],
] as const;

export type PlaceCategory = (typeof categoryOptions)[number][0];

export const qualityLabels: Record<PlaceCategory, string> = {
  restaurant: "菜品 / 口味",
  cafe: "咖啡与出品",
  drinks: "饮品质量",
  bar: "酒水 / 调酒",
  bakery_dessert: "甜品与烘焙",
  street_food: "菜品 / 口味",
  other_food_drink: "出品质量",
};

export const sceneTags = [
  ["business_dining", "商务宴请"],
  ["friends_gathering", "朋友聚会"],
  ["date", "约会"],
  ["family_meal", "家庭聚餐"],
  ["solo", "一个人"],
  ["quick_bite", "快速简餐"],
  ["work_study", "工作 / 学习"],
  ["celebration", "庆祝纪念"],
  ["late_night", "深夜"],
  ["out_of_town_friends", "带外地朋友"],
  ["travel_checkin", "旅行打卡"],
  ["takeaway", "外带 / 打包"],
] as const;

export const sceneTagLabels = Object.fromEntries(sceneTags) as Record<string, string>;

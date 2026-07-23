import Link from "next/link";
import { categoryOptions, sceneTags } from "@/lib/mark-options";

type DiscoverFiltersProps = {
  cities: string[];
  selectedCategories: string[];
  selectedScenes: string[];
  city: string;
  minRating: string;
  minEnvironment: string;
  wanted: boolean;
};

export function DiscoverFilters({ cities, selectedCategories, selectedScenes, city, minRating, minEnvironment, wanted }: DiscoverFiltersProps) {
  const selectedCount = selectedCategories.length + selectedScenes.length + Number(Boolean(city)) + Number(Boolean(minRating)) + Number(Boolean(minEnvironment)) + Number(wanted);
  return <details className="discover-filters" open={selectedCount > 0}>
    <summary>筛选地点{selectedCount > 0 ? <b>{selectedCount}</b> : null}</summary>
    <form method="get">
      <fieldset><legend>主类型 <span>可多选</span></legend><div className="filter-option-grid">{categoryOptions.map(([value, label]) => <label key={value}><input type="checkbox" name="category" value={value} defaultChecked={selectedCategories.includes(value)} /><span>{label}</span></label>)}</div></fieldset>
      <label className="discover-filter-select">城市<select name="city" defaultValue={city}><option value="">全部城市</option>{cities.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <fieldset><legend>场景 <span>可多选</span></legend><div className="filter-option-grid filter-option-grid--scene">{sceneTags.map(([value, label]) => <label key={value}><input type="checkbox" name="scene" value={value} defaultChecked={selectedScenes.includes(value)} /><span>{label}</span></label>)}</div></fieldset>
      <div className="discover-filter-selects"><label>小组均分<select name="minRating" defaultValue={minRating}><option value="">不限</option><option value="4">4.0 分及以上</option><option value="4.5">4.5 分及以上</option></select></label><label>环境均分<select name="minEnvironment" defaultValue={minEnvironment}><option value="">不限</option><option value="4">4.0 分及以上</option><option value="4.5">4.5 分及以上</option></select></label></div>
      <label className="wishlist-filter"><input type="checkbox" name="wanted" value="1" defaultChecked={wanted} /> 只看我想去的地点</label>
      <div className="discover-filter-actions"><Link href="/discover">清空</Link><button className="primary-button" type="submit">应用筛选</button></div>
    </form>
  </details>;
}

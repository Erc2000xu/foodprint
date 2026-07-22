import { AppShell } from "@/components/shell/app-shell";

const quickFilters = ["附近", "咖啡馆", "约会", "环境 4+ "];

export default function Home() {
  return (
    <AppShell>
      <section className="map-stage" aria-label="地图功能开发占位区">
        <div className="map-stage__grid" aria-hidden="true" />
        <div className="map-stage__water map-stage__water--one" aria-hidden="true" />
        <div className="map-stage__water map-stage__water--two" aria-hidden="true" />

        <div className="map-toolbar">
          <button className="search-trigger" type="button">
            <span aria-hidden="true">⌕</span>
            搜索朋友推荐的地方
          </button>
          <button className="icon-button" type="button" aria-label="定位到当前位置">
            ◎
          </button>
        </div>

        <div className="filter-row" aria-label="快捷筛选（Phase 0 静态展示）">
          {quickFilters.map((filter, index) => (
            <button className={index === 0 ? "filter-chip filter-chip--active" : "filter-chip"} key={filter} type="button">
              {filter}
            </button>
          ))}
        </div>

        <div className="map-placeholder" role="status">
          <span className="map-placeholder__pin" aria-hidden="true">✦</span>
          <p>地图将在 Phase 2 接入高德</p>
          <small>目前先建立安全的 UI、主题与适配器边界。</small>
        </div>
      </section>

      <section className="place-sheet" aria-labelledby="welcome-title">
        <div className="sheet-handle" aria-hidden="true" />
        <div className="eyebrow">共同地图 · 准备中</div>
        <h1 id="welcome-title">把值得再去的地方，留给懂你的人。</h1>
        <p>
          食迹只收录朋友真实体验过、愿意推荐的餐饮地点。登录、邀请与地点标记会在后续阶段逐步开放。
        </p>
        <div className="welcome-card">
          <div className="mascot-mark" aria-hidden="true">FP</div>
          <div>
            <strong>从一次真实体验开始</strong>
            <span>新地点必须和首条推荐标记一起创建。</span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

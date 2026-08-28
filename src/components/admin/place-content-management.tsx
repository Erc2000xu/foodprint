import Link from "next/link";

export type ManagementCounts = {
  activePlaceCount: number;
  archivedPlaceCount: number;
  candidateCount: number;
  hiddenContentCount: number;
};

export function PlaceContentManagement({ counts, error = false }: { counts: ManagementCounts | null; error?: boolean }) {
  return <section className="admin-card place-content-management" id="place-content-management">
    <h2>地点与内容管理</h2>
    <p>管理地点下架、恢复和已隐藏内容。管理操作不会改写成员的原始观点。</p>
    {counts ? <div className="management-counts management-counts--summary"><span><b>{counts.activePlaceCount}</b>上架中地点</span><span><b>{counts.archivedPlaceCount}</b>已下架地点</span><span><b>{counts.candidateCount}</b>候选记录</span><span><b>{counts.hiddenContentCount}</b>已隐藏内容</span></div> : <p className="empty-note">{error ? "管理数量暂时无法读取，请打开管理中心重试。" : "正在读取管理数量…"}</p>}
    <Link className="primary-link management-center-link" href="/admin/content">打开管理中心</Link>
  </section>;
}

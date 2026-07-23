export function DataExportPanel({ isOwner }: { isOwner: boolean }) {
  return <section className="admin-card data-export"><h2>导出我的数据</h2><p>下载 JSON 文件，包含稳定 ID、地点来源、坐标、时间和关联关系；不包含任何照片文件本身，只包含私有文件清单。</p><div><a className="text-button" href="/api/export?scope=mine">下载我的 JSON</a>{isOwner && <a className="text-button" href="/api/export?scope=group">导出整个共同地图</a>}</div>{isOwner && <small>小组导出仅 Owner 可用，包含成员、地点、标记、访问、想去和照片清单。</small>}</section>;
}

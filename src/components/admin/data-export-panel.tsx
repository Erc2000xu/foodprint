export function DataExportPanel({ isOwner }: { isOwner: boolean }) {
  return <section className="admin-card data-export"><h2>导出我的数据</h2><p>下载包含地点、到访记录和当前偏好的 JSON 文件。照片文件不会下载，只会列出文件清单。</p><div><a className="text-button" href="/api/export?scope=mine">下载我的 JSON</a>{isOwner && <a className="text-button" href="/api/export?scope=group">导出共同地图</a>}</div>{isOwner && <small>小组导出仅 Owner 可用，包含成员、地点、标记、到访、当前偏好、下回吃和照片清单。</small>}</section>;
}

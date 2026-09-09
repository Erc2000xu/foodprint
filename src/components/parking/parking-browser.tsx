"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { mapFailure as createMapFailure, type MapFailure } from "@/lib/amap/map-failure";
import type { DiscoveryMapRuntimeConfig } from "@/lib/env.server";
import { parkingMarkInputFromRow } from "@/lib/adapters/parking-repository";
import {
  formatParkingLength,
  normalizeParkingGeometry,
  parkingCoordinatesForPreview,
  parkingDefaultName,
  parkingGeometryLabel,
  parkingLengthMeters,
} from "@/lib/parking/geometry";
import type { ParkingCoordinate, ParkingCoordinates, ParkingGeometryType, ParkingMark, ParkingViewport } from "@/lib/parking/types";
import { readParkingNavigationState, rememberParkingNavigationState } from "@/lib/parking/navigation-state";
import {
  createParkingMark,
  deleteParkingMark,
  getParkingAccessStatus,
  loadParkingMarks,
  updateParkingMark,
} from "@/app/parking/actions";
import { ParkingMapAdapter } from "@/components/parking/parking-map-adapter";

type ParkingPanel = "summary" | "type-picker" | "select" | "form" | "detail" | "list";
type FormDraft = { name: string; comment: string; isConvenient: boolean };
type DraftGeometry = { geometryType: ParkingGeometryType; coordinates: ParkingCoordinates };

const parkingViewportCache = new Map<string, ParkingViewport>();

function newRequestKey() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12);
}

function openAreaCoordinates(coordinates: ParkingCoordinates) {
  if (!Array.isArray(coordinates[0])) return [coordinates as ParkingCoordinate];
  const points = coordinates as ParkingCoordinate[];
  if (points.length > 1 && points[0][0] === points.at(-1)?.[0] && points[0][1] === points.at(-1)?.[1]) return points.slice(0, -1);
  return points;
}

function geometrySummary(mark: Pick<ParkingMark, "geometryType" | "coordinates"> | DraftGeometry) {
  const length = parkingLengthMeters(mark.geometryType, mark.coordinates);
  return mark.geometryType === "point" ? "一个位置" : mark.geometryType === "line" ? formatParkingLength(length) : "已闭合区域";
}

export type ParkingBrowserProps = {
  userId: string;
  groupId: string;
  initialMarks: ParkingMark[];
  initialDataError?: string;
  mapRuntimeConfig: DiscoveryMapRuntimeConfig;
};

export function ParkingBrowser({ userId, groupId, initialMarks, initialDataError, mapRuntimeConfig }: ParkingBrowserProps) {
  const [marks, setMarks] = useState(initialMarks);
  const [panel, setPanel] = useState<ParkingPanel>(initialDataError ? "list" : "summary");
  const [selectedMarkId, setSelectedMarkId] = useState<string>();
  const [selectionType, setSelectionType] = useState<ParkingGeometryType>("point");
  const [selectionNodes, setSelectionNodes] = useState<ParkingCoordinate[]>([]);
  const [draftGeometry, setDraftGeometry] = useState<DraftGeometry>();
  const [editingMarkId, setEditingMarkId] = useState<string>();
  const [formDraft, setFormDraft] = useState<FormDraft>({ name: "", comment: "", isConvenient: false });
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [dataError, setDataError] = useState(initialDataError ?? "");
  const [pending, setPending] = useState(false);
  const [mapFailure, setMapFailure] = useState<MapFailure | undefined>(() => mapRuntimeConfig.enabled ? undefined : createMapFailure("configuration", "missing_public_key", false));
  const [mapRetryGeneration, setMapRetryGeneration] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [locateRequest, setLocateRequest] = useState(0);
  const [locating, setLocating] = useState(false);
  const [viewport, setViewport] = useState<ParkingViewport>(() => parkingViewportCache.get(userId) ?? readParkingNavigationState(userId)?.parkingViewport ?? readParkingNavigationState(userId)?.discoveryViewport ?? { center: [116.397428, 39.90923], zoom: 11 });
  const [accessLost, setAccessLost] = useState(false);
  const viewportRef = useRef(viewport);
  const requestKeyRef = useRef(newRequestKey());
  const selectedMark = selectedMarkId ? marks.find((mark) => mark.id === selectedMarkId) : undefined;
  const editingMark = editingMarkId ? marks.find((mark) => mark.id === editingMarkId) : undefined;
  const mapAvailable = mapRuntimeConfig.enabled && !mapFailure && !accessLost;
  const mapBottomPadding = panel === "select" ? 220 : 0;

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => () => {
    parkingViewportCache.set(userId, viewportRef.current);
    rememberParkingNavigationState(userId, { parkingViewport: viewportRef.current });
  }, [userId]);

  useEffect(() => {
    let disposed = false;
    const verify = async () => {
      const status = await getParkingAccessStatus();
      if (disposed || status.allowed) return;
      setAccessLost(true);
      setMarks([]);
      setSelectedMarkId(undefined);
      setDraftGeometry(undefined);
      setSelectionNodes([]);
      setNotice("停车地图权限已失效，已清空当前页面内容。");
      setPanel("summary");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void verify();
    };
    const timer = window.setInterval(() => void verify(), 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const preview = useMemo(() => {
    if (panel === "select") {
      const coordinates = parkingCoordinatesForPreview(selectionType, selectionNodes);
      return coordinates ? { geometryType: selectionType, coordinates } : null;
    }
    return draftGeometry ?? null;
  }, [draftGeometry, panel, selectionNodes, selectionType]);

  const resetDraft = () => {
    setPanel("summary");
    setSelectionNodes([]);
    setDraftGeometry(undefined);
    setEditingMarkId(undefined);
    setFormDraft({ name: "", comment: "", isConvenient: false });
    setFormError("");
    requestKeyRef.current = newRequestKey();
  };

  const beginCreate = () => {
    if (!mapAvailable) {
      setNotice("地图暂不可用，无法新增位置；可以先查看已有停车记录。");
      setPanel("list");
      return;
    }
    setNotice("");
    setFormError("");
    setEditingMarkId(undefined);
    setDraftGeometry(undefined);
    setSelectionNodes([]);
    setPanel("type-picker");
  };

  const chooseType = (type: ParkingGeometryType) => {
    setSelectionType(type);
    setSelectionNodes([]);
    setDraftGeometry(undefined);
    setFormError("");
    setPanel("select");
  };

  const confirmNode = () => {
    if (!mapReady || !mapAvailable) {
      setNotice("地图准备好后才能确认位置。");
      return;
    }
    const center = viewportRef.current.center;
    if (selectionType === "point") {
      setDraftGeometry({ geometryType: "point", coordinates: center });
      setFormError("");
      setPanel("form");
      return;
    }
    if (selectionNodes.some((node) => Math.abs(node[0] - center[0]) < 1e-9 && Math.abs(node[1] - center[1]) < 1e-9)) {
      setNotice("这个位置已经添加过了，请拖动地图后再添加。");
      return;
    }
    setSelectionNodes((nodes) => [...nodes, center]);
    setNotice("");
  };

  const finishSelection = () => {
    const normalized = normalizeParkingGeometry(selectionType, selectionNodes);
    if (!normalized.ok) {
      setFormError(normalized.error);
      return;
    }
    setDraftGeometry({ geometryType: selectionType, coordinates: normalized.coordinates });
    setFormError("");
    setPanel("form");
  };

  const undoNode = () => setSelectionNodes((nodes) => nodes.slice(0, -1));

  const cancelSelection = () => {
    if (editingMarkId && editingMark) {
      if (selectionNodes.length > 0 && !window.confirm("放弃重新选择的位置吗？")) return;
      setDraftGeometry({ geometryType: editingMark.geometryType, coordinates: editingMark.coordinates });
      setSelectionNodes([]);
      setFormError("");
      setPanel("form");
      return;
    }
    if (selectionNodes.length > 0 && !window.confirm("放弃已选择的节点吗？")) return;
    resetDraft();
  };

  const openEdit = (mark: ParkingMark) => {
    setSelectedMarkId(mark.id);
    setEditingMarkId(mark.id);
    setSelectionType(mark.geometryType);
    setDraftGeometry({ geometryType: mark.geometryType, coordinates: mark.coordinates });
    setFormDraft(parkingMarkInputFromRow(mark));
    setFormError("");
    setNotice("");
    setPanel("form");
  };

  const reselectEditingGeometry = () => {
    if (!editingMark || !mapAvailable) {
      setNotice("地图暂不可用，当前只能修改名称和备注。");
      return;
    }
    setSelectionType(editingMark.geometryType);
    setSelectionNodes(editingMark.geometryType === "point" ? [] : openAreaCoordinates(editingMark.coordinates));
    setDraftGeometry(undefined);
    setFormError("");
    setPanel("select");
  };

  const cancelForm = () => {
    const dirty = Boolean(draftGeometry || formDraft.name || formDraft.comment || formDraft.isConvenient || editingMarkId);
    if (dirty && !window.confirm("放弃未保存的停车记录吗？")) return;
    resetDraft();
  };

  const saveForm = async () => {
    if (!draftGeometry) {
      setFormError("请先选择位置。");
      return;
    }
    const normalized = normalizeParkingGeometry(draftGeometry.geometryType, draftGeometry.coordinates);
    if (!normalized.ok) {
      setFormError(normalized.error);
      return;
    }
    if (!formDraft.isConvenient) {
      setFormError("请先勾选“我确认这里方便停摩托车”。");
      return;
    }
    setPending(true);
    setFormError("");
    const input = {
      groupId,
      geometryType: draftGeometry.geometryType,
      coordinates: normalized.coordinates,
      name: formDraft.name,
      isConvenient: formDraft.isConvenient,
      comment: formDraft.comment,
    };
    const result = editingMarkId
      ? await updateParkingMark({ ...input, id: editingMarkId })
      : await createParkingMark({ ...input, requestKey: requestKeyRef.current });
    setPending(false);
    if (result.error) {
      if (result.error.includes("权限已失效")) {
        setAccessLost(true);
        setMarks([]);
        setPanel("summary");
      }
      setFormError(result.error);
      return;
    }
    if (!result.mark) {
      setFormError("保存结果暂时无法读取，请刷新停车地图。");
      return;
    }
    setMarks((current) => current.some((mark) => mark.id === result.mark?.id) ? current.map((mark) => mark.id === result.mark?.id ? result.mark! : mark) : [result.mark!, ...current]);
    setSelectedMarkId(result.mark.id);
    setEditingMarkId(undefined);
    setDraftGeometry(undefined);
    setSelectionNodes([]);
    setFormDraft({ name: "", comment: "", isConvenient: false });
    requestKeyRef.current = newRequestKey();
    setNotice(result.success ?? "已保存。");
    setPanel("detail");
  };

  const removeMark = async (mark: ParkingMark) => {
    if (!mark.canEdit || !window.confirm("删除后这条贡献会从共享停车地图隐藏，确定删除吗？")) return;
    setPending(true);
    const result = await deleteParkingMark(mark.id);
    setPending(false);
    if (result.error) {
      if (result.error.includes("权限已失效")) {
        setAccessLost(true);
        setMarks([]);
        setPanel("summary");
      }
      setNotice(result.error);
      return;
    }
    setMarks((current) => current.filter((item) => item.id !== mark.id));
    setSelectedMarkId(undefined);
    setNotice(result.success ?? "已删除。");
    setPanel("summary");
  };

  const refreshMarks = async () => {
    setPending(true);
    const result = await loadParkingMarks();
    setPending(false);
    if (result.status === "denied") {
      setAccessLost(true);
      setMarks([]);
      setPanel("summary");
      setNotice("停车地图权限已失效，已清空当前页面内容。");
      return;
    }
    if (result.status === "error") {
      setDataError("停车记录暂时无法读取，请稍后重试。");
      return;
    }
    setDataError("");
    setMarks(result.marks);
    setNotice("停车地图已刷新。");
  };

  const selectMark = (markId: string) => {
    setSelectedMarkId(markId);
    setPanel("detail");
    setNotice("");
  };

  const mapErrorMessage = mapFailure ? "地图暂时没打开，仍可查看和管理已有停车记录。" : "";

  return (
    <section className="parking-page" aria-label="停车地图">
      <div className="parking-map-stage">
        {mapAvailable ? <ParkingMapAdapter apiKey={mapRuntimeConfig.enabled ? mapRuntimeConfig.jsApiKey : ""} marks={marks} selectedMarkId={selectedMarkId} preview={preview} initialViewport={viewport} retryGeneration={mapRetryGeneration} mapBottomPadding={mapBottomPadding} locateRequest={locateRequest} onReady={() => setMapReady(true)} onViewportSettled={(next) => { setViewport(next); viewportRef.current = next; }} onSelectMark={selectMark} onClearSelection={() => { setSelectedMarkId(undefined); if (panel === "detail") setPanel("summary"); }} onLocationResult={(coordinate) => { setLocating(false); setViewport((current) => ({ ...current, center: coordinate, zoom: Math.max(14, current.zoom) })); setNotice("已回到当前位置。"); }} onLocationError={() => { setLocating(false); setNotice("暂时无法获取当前位置，可以继续拖动地图选择。"); }} onFatalError={(failure) => { setMapFailure(failure); setMapReady(false); setNotice("地图暂时不可用；已有记录仍可查看。"); if (panel === "select") setPanel("summary"); }} /> : <div className="parking-map-fallback" role="status"><strong>{accessLost ? "停车地图权限已失效" : "地图暂时不可用"}</strong><span>{accessLost ? "请返回发现页重新确认权限。" : mapErrorMessage || "可以查看已有停车记录，但暂时不能新增或调整位置。"}</span>{mapFailure && !accessLost && <button type="button" className="text-button" onClick={() => { setMapFailure(undefined); setMapRetryGeneration((value) => value + 1); setMapReady(false); }}>重试地图</button>}</div>}
        {mapAvailable && panel === "select" && <div className="parking-crosshair" aria-hidden="true"><span /></div>}
        <div className="parking-topbar">
          <Link href="/" className="parking-back-link" aria-label="返回发现">‹ 返回发现</Link>
          <div className="parking-topbar__title"><span>共享停车地图</span><strong>停车地图</strong></div>
          <button type="button" className="parking-list-button" onClick={() => setPanel(panel === "list" ? "summary" : "list")}>{panel === "list" ? "地图" : "列表"}</button>
        </div>
        {mapAvailable && <button type="button" className={`parking-locate-button${locating ? " is-loading" : ""}`} aria-label="定位到当前位置" disabled={locating} onClick={() => { setLocating(true); setLocateRequest((value) => value + 1); }}>◎</button>}
        {dataError && <div className="parking-data-error" role="alert"><span>{dataError}</span><button type="button" className="text-button" onClick={() => void refreshMarks()} disabled={pending}>重试读取</button></div>}
        {notice && <div className="parking-notice" role="status" aria-live="polite">{notice}</div>}
      </div>
      {accessLost ? <section className="parking-panel parking-panel--access-lost"><p className="eyebrow">权限已变化</p><h1>暂时不能打开停车地图</h1><p>停车权限已撤销或成员状态已变化。你之前创建的记录仍会保留在共享地图中。</p><Link className="primary-link" href="/">返回发现</Link></section> : <ParkingPanelContent panel={panel} marks={marks} dataError={dataError} selectedMark={selectedMark} editingMark={editingMark} selectionType={selectionType} selectionNodes={selectionNodes} draftGeometry={draftGeometry} formDraft={formDraft} formError={formError} pending={pending} mapAvailable={mapAvailable} mapReady={mapReady} onBeginCreate={beginCreate} onChooseType={chooseType} onConfirmNode={confirmNode} onFinishSelection={finishSelection} onUndoNode={undoNode} onReselect={() => { setSelectionNodes([]); setDraftGeometry(undefined); setFormError(""); }} onCancelSelection={cancelSelection} onEdit={openEdit} onReselectEditingGeometry={reselectEditingGeometry} onCancelForm={cancelForm} onSave={saveForm} onDelete={removeMark} onSelectMark={selectMark} onRefresh={() => void refreshMarks()} onCloseDetail={() => { setSelectedMarkId(undefined); setPanel("summary"); }} onOpenList={() => setPanel("list")} onOpenSummary={() => setPanel("summary")} onFormChange={setFormDraft} />}
    </section>
  );
}

type ParkingPanelContentProps = {
  panel: ParkingPanel;
  marks: ParkingMark[];
  dataError: string;
  selectedMark?: ParkingMark;
  editingMark?: ParkingMark;
  selectionType: ParkingGeometryType;
  selectionNodes: ParkingCoordinate[];
  draftGeometry?: DraftGeometry;
  formDraft: FormDraft;
  formError: string;
  pending: boolean;
  mapAvailable: boolean;
  mapReady: boolean;
  onBeginCreate: () => void;
  onChooseType: (type: ParkingGeometryType) => void;
  onConfirmNode: () => void;
  onFinishSelection: () => void;
  onUndoNode: () => void;
  onReselect: () => void;
  onCancelSelection: () => void;
  onEdit: (mark: ParkingMark) => void;
  onReselectEditingGeometry: () => void;
  onCancelForm: () => void;
  onSave: () => void;
  onDelete: (mark: ParkingMark) => void;
  onSelectMark: (markId: string) => void;
  onRefresh: () => void;
  onCloseDetail: () => void;
  onOpenList: () => void;
  onOpenSummary: () => void;
  onFormChange: (draft: FormDraft) => void;
};

function ParkingPanelContent(props: ParkingPanelContentProps) {
  const {
    panel, marks, dataError, selectedMark, editingMark, selectionType, selectionNodes, draftGeometry, formDraft, formError, pending, mapAvailable, mapReady,
    onBeginCreate, onChooseType, onConfirmNode, onFinishSelection, onUndoNode, onReselect, onCancelSelection, onEdit, onReselectEditingGeometry,
    onCancelForm, onSave, onDelete, onSelectMark, onRefresh, onCloseDetail, onOpenList, onOpenSummary, onFormChange,
  } = props;
  if (panel === "type-picker") {
    return <section className="parking-panel parking-panel--type-picker"><div className="parking-panel__heading"><div><p className="eyebrow">新增标记</p><h2>你想记录哪一种？</h2></div><button type="button" className="parking-close-button" onClick={onCancelSelection}>关闭</button></div><div className="parking-type-grid">{(["point", "line", "area"] as const).map((type) => <button type="button" key={type} className="parking-type-card" onClick={() => onChooseType(type)}><strong>{parkingGeometryLabel(type)}</strong><span>{type === "point" ? "记录一个方便停车的位置" : type === "line" ? "沿路边添加两个或多个节点" : "沿区域边缘添加三个或多个节点"}</span></button>)}</div></section>;
  }
  if (panel === "select") {
    const lineLength = selectionType === "line" && selectionNodes.length > 1 ? ` · ${formatParkingLength(parkingLengthMeters("line", selectionNodes))}` : "";
    const label = selectionType === "point" ? "把位置对准中心准星" : selectionType === "line" ? `已添加 ${selectionNodes.length} 个节点${lineLength}` : `已添加 ${selectionNodes.length} 个节点，完成后自动闭合`;
    return <section className="parking-panel parking-panel--select"><div className="parking-panel__heading"><div><p className="eyebrow">选择{parkingGeometryLabel(selectionType)}</p><h2>{label}</h2></div><button type="button" className="parking-close-button" onClick={onCancelSelection}>取消</button></div><p className="parking-panel__hint">拖动地图，不用手指在地图上画线；中心准星的位置就是当前节点。</p><div className="parking-selection-actions"><button type="button" className="text-button" onClick={onUndoNode} disabled={selectionNodes.length === 0}>撤销上一个点</button><button type="button" className="text-button" onClick={onReselect}>重新选</button>{selectionType === "point" ? <button type="button" className="primary-button" onClick={onConfirmNode} disabled={!mapReady || !mapAvailable}>确认位置</button> : <><button type="button" className="secondary-button" onClick={onConfirmNode} disabled={!mapReady || !mapAvailable}>添加节点</button><button type="button" className="primary-button" onClick={onFinishSelection} disabled={selectionNodes.length < (selectionType === "area" ? 3 : 2)}>完成</button></>}</div>{formError && <p className="parking-form-error" role="alert">{formError}</p>}</section>;
  }
  if (panel === "form") {
    const type = draftGeometry?.geometryType ?? editingMark?.geometryType ?? "point";
    return <section className="parking-panel parking-panel--form"><div className="parking-panel__heading"><div><p className="eyebrow">填写停车记录</p><h2>{editingMark ? "编辑停车记录" : "确认停车位置"}</h2></div><button type="button" className="parking-close-button" onClick={onCancelForm}>取消</button></div><div className="parking-form-location"><strong>{parkingGeometryLabel(type)} · {draftGeometry ? geometrySummary(draftGeometry) : editingMark ? geometrySummary(editingMark) : "位置已选"}</strong><span>{editingMark ? "你只能编辑自己创建的记录。" : "位置以 GCJ-02 坐标保存，不需要填写地址。"}</span>{editingMark && <button type="button" className="text-button" onClick={onReselectEditingGeometry} disabled={!mapAvailable}>重新选择位置</button>}</div><label className="parking-field"><span>名称 <small>可选，最多 30 字</small></span><input value={formDraft.name} maxLength={30} onChange={(event) => onFormChange({ ...formDraft, name: event.target.value })} placeholder={parkingDefaultName(type)} /></label><label className="parking-check-field"><input type="checkbox" checked={formDraft.isConvenient} onChange={(event) => onFormChange({ ...formDraft, isConvenient: event.target.checked })} /><span>我确认这里方便停摩托车</span></label><label className="parking-field"><span>备注 <small>可选，最多 500 字</small></span><textarea value={formDraft.comment} maxLength={500} onChange={(event) => onFormChange({ ...formDraft, comment: event.target.value })} placeholder="例如：入口在东侧，靠墙停，晚上比较空" rows={3} /><small className="parking-counter">{formDraft.comment.length}/500</small></label>{formError && <p className="parking-form-error" role="alert">{formError}</p>}<div className="parking-form-actions"><button type="button" className="secondary-button" onClick={onCancelForm}>放弃</button><button type="button" className="primary-button" onClick={onSave} disabled={pending}>{pending ? "正在保存…" : editingMark ? "保存修改" : "保存记录"}</button></div></section>;
  }
  if (panel === "detail" && selectedMark) {
    return <section className="parking-panel parking-panel--detail"><div className="parking-panel__heading"><div><p className="eyebrow">{parkingGeometryLabel(selectedMark.geometryType)} · {geometrySummary(selectedMark)}</p><h2>{selectedMark.displayName}</h2></div><button type="button" className="parking-close-button" onClick={onCloseDetail}>关闭</button></div><div className="parking-detail-meta"><span>方便停摩托车</span><span>由 {selectedMark.creatorDisplayName} 创建</span><span>更新于 {new Date(selectedMark.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>{selectedMark.comment && <p className="parking-detail-comment">{selectedMark.comment}</p>}{selectedMark.canEdit ? <div className="parking-form-actions"><button type="button" className="secondary-button" onClick={() => onEdit(selectedMark)}>编辑</button><button type="button" className="danger-button" onClick={() => void onDelete(selectedMark)} disabled={pending}>删除</button></div> : <p className="parking-readonly-note">这是其他授权成员创建的记录，只能查看。</p>}</section>;
  }
  if (panel === "list") {
    return <section className="parking-panel parking-panel--list"><div className="parking-panel__heading"><div><p className="eyebrow">共享记录 · {marks.length}</p><h2>停车位置</h2></div><div className="parking-list-actions"><button type="button" className="text-button" onClick={onRefresh} disabled={pending}>刷新</button><button type="button" className="parking-close-button" onClick={onOpenSummary}>地图</button></div></div>{dataError ? <div className="parking-empty"><strong>停车记录暂时无法读取</strong><span>请点击上方“重试读取”；已有页面内容未被当成空数据。</span></div> : marks.length ? <ul className="parking-mark-list">{marks.map((mark) => <li key={mark.id}><button type="button" className="parking-mark-list__button" onClick={() => onSelectMark(mark.id)}><span className={`parking-list-kind parking-list-kind--${mark.geometryType}`} aria-hidden="true">{mark.geometryType === "point" ? "●" : mark.geometryType === "line" ? "━" : "⬟"}</span><span><strong>{mark.displayName}</strong><small>{parkingGeometryLabel(mark.geometryType)} · {geometrySummary(mark)} · {mark.creatorDisplayName}</small></span></button></li>)}</ul> : <div className="parking-empty"><strong>还没有停车记录</strong><span>地图可用后，添加第一条方便停车的位置。</span><button type="button" className="primary-button" onClick={onBeginCreate} disabled={!mapAvailable}>新增标记</button></div>}</section>;
  }
  return <section className="parking-panel parking-panel--summary"><div className="parking-summary-copy"><p className="eyebrow">共享停车地图</p><h1>{marks.length ? `已记录 ${marks.length} 处停车位置` : "记录第一处停车位置"}</h1><p>{marks.length ? "授权成员可以共享查看，每个人只能编辑或删除自己创建的记录。" : "点、路段和区域都可以记录；先拖动地图，再用中心准星确认位置。"}</p></div><div className="parking-summary-actions"><button type="button" className="primary-button" onClick={onBeginCreate} disabled={!mapAvailable}>新增标记</button><button type="button" className="secondary-button" onClick={onOpenSummary}>拖动地图查看</button>{marks.length > 0 && <button type="button" className="text-button" onClick={onOpenList}>查看列表</button>}</div></section>;
}

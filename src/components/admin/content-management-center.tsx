"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import {
  loadContentManagement,
  restoreGroupPlace,
  restoreHiddenContent,
  restorePlaceCandidate,
  type ContentManagementPage,
  type ManagementTab,
  type PlaceManagementResult,
} from "@/app/admin/actions";
import type { ManagementCounts } from "@/components/admin/place-content-management";

type CandidateStatus = "pending" | "dismissed";
type ManagementItem = Record<string, unknown>;
type LoadOptions = { tab: ManagementTab; status?: CandidateStatus; query: string; cursor?: ContentManagementPage["nextCursor"]; append?: boolean };

const tabs: Array<{ value: ManagementTab; label: string; countKey: keyof ManagementCounts }> = [
  { value: "active", label: "上架中地点", countKey: "activePlaceCount" },
  { value: "archived", label: "已下架地点", countKey: "archivedPlaceCount" },
  { value: "candidate", label: "候选地点", countKey: "candidateCount" },
  { value: "hidden", label: "已隐藏内容", countKey: "hiddenContentCount" },
];

const text = (item: ManagementItem, key: string, fallback = "") => {
  const value = item[key];
  return typeof value === "string" ? value : fallback;
};

const count = (item: ManagementItem, key: string) => {
  const value = Number(item[key]);
  return Number.isFinite(value) ? value : 0;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间待补充" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date);
}

function RestoreButton({ kind, id, contentType, onChanged }: { kind: "place" | "candidate" | "hidden"; id: string; contentType?: "visit" | "photo"; onChanged: () => void }) {
  const action = kind === "place" ? restoreGroupPlace : kind === "candidate" ? restorePlaceCandidate : restoreHiddenContent;
  const [state, formAction, pending] = useStateAction(action);
  const handledSuccess = useRef(false);
  useEffect(() => {
    if (!state.success || handledSuccess.current) return;
    handledSuccess.current = true;
    onChanged();
  }, [onChanged, state.success]);
  return <form className="content-management__action-form" action={formAction}>
    <input name={kind === "place" ? "group_place_id" : kind === "candidate" ? "candidate_id" : "content_id"} type="hidden" value={id} />
    {kind === "hidden" && <input name="content_type" type="hidden" value={contentType ?? "visit"} />}
    <button className="secondary-button content-management__restore" disabled={pending} type="submit">{pending ? "恢复中…" : kind === "candidate" ? "恢复候选" : "恢复显示"}</button>
    {state.error && <small className="content-management__action-error">{state.error}</small>}
  </form>;
}

function useStateAction(action: (previousState: PlaceManagementResult, formData: FormData) => Promise<PlaceManagementResult>) {
  // This small adapter keeps every restore control independent, so one failed row cannot hide another row's state.
  const [state, setState] = useState<PlaceManagementResult>({});
  const [pending, startTransition] = useTransition();
  const formAction = useCallback((formData: FormData) => {
    startTransition(async () => setState(await action(state, formData)));
  }, [action, state]);
  return [state, formAction, pending] as const;
}

function ItemDetails({ tab, item, onChanged }: { tab: ManagementTab; item: ManagementItem; onChanged: () => void }) {
  if (tab === "active" || tab === "archived") {
    const groupPlaceId = text(item, "group_place_id");
    return <article className="content-management__item">
      <div className="content-management__item-copy"><span className="content-management__eyebrow">{tab === "active" ? "发现与地图可见" : "已下架，历史内容保留"}</span><h3><Link href={`/place/${groupPlaceId}`}>{text(item, "place_name", "未命名地点")}</Link></h3><p>{text(item, "address", "地址待补充")}</p><small>观点 {count(item, "opinion_count")} · 到访 {count(item, "visit_count")} · 照片 {count(item, "photo_count")}</small>{tab === "archived" && <small>{text(item, "archived_reason", "未记录下架原因")} · {text(item, "archived_by_name", "管理成员")} · {formatDate(text(item, "archived_at"))}</small>}</div>{tab === "archived" ? <RestoreButton kind="place" id={groupPlaceId} onChanged={onChanged} /> : <Link className="secondary-button content-management__restore" href={`/place/${groupPlaceId}`}>管理 ›</Link>}</article>;
  }
  if (tab === "candidate") {
    const isDismissed = text(item, "status") === "dismissed";
    return <article className="content-management__item"><div className="content-management__item-copy"><span className="content-management__eyebrow">{isDismissed ? "已不推荐" : "仍在去试试"}</span><h3>{text(item, "place_name", "未命名地点")}</h3><p>{text(item, "address", "地址待补充")}</p><small>提交于 {formatDate(text(item, "created_at"))}{text(item, "resolution_reason") ? ` · ${text(item, "resolution_reason")}` : ""}</small></div>{isDismissed ? <RestoreButton kind="candidate" id={text(item, "candidate_id")} onChanged={onChanged} /> : <Link className="secondary-button content-management__restore" href="/try">打开去试试</Link>}</article>;
  }
  const contentType = text(item, "content_type") === "photo" ? "photo" : "visit";
  return <article className="content-management__item"><div className="content-management__item-copy"><span className="content-management__eyebrow">{contentType === "photo" ? "照片" : "到访记录"} · 已隐藏</span><h3>{text(item, "place_name", "未命名地点")}</h3><p>{text(item, "address", "地址待补充")}</p><small>{text(item, "hidden_reason", "未记录隐藏原因")} · {formatDate(text(item, "hidden_at"))}</small></div><RestoreButton kind="hidden" id={text(item, "content_id")} contentType={contentType} onChanged={onChanged} /></article>;
}

export function ContentManagementCenter({ initialCounts, initialPage }: { initialCounts: ManagementCounts | null; initialPage: ContentManagementPage }) {
  const [activeTab, setActiveTab] = useState<ManagementTab>("active");
  const [candidateStatus, setCandidateStatus] = useState<CandidateStatus>("pending");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [counts, setCounts] = useState<ManagementCounts | null>(initialCounts);
  const [page, setPage] = useState<ContentManagementPage>(initialPage);
  const [items, setItems] = useState<ManagementItem[]>(initialPage.items);
  const [pending, startTransition] = useTransition();
  const requestSequence = useRef(0);
  const lastLoadOptionsRef = useRef<LoadOptions | null>(null);

  const loadPage = useCallback((options: LoadOptions) => {
    lastLoadOptionsRef.current = options;
    const sequence = ++requestSequence.current;
    if (!options.append) setItems([]);
    startTransition(async () => {
      const result = await loadContentManagement({ tab: options.tab, status: options.status, query: options.query || undefined, limit: 20, cursor: options.cursor });
      if (sequence !== requestSequence.current) return;
      if (result.error) {
        setPage((current) => options.append ? { ...current, error: result.error } : result);
        return;
      }
      setPage(result);
      setItems((current) => options.append ? [...current, ...result.items] : result.items);
    });
  }, []);

  const retryPage = useCallback(() => {
    const options = lastLoadOptionsRef.current;
    if (options) loadPage(options);
  }, [loadPage]);

  const reload = useCallback(() => {
    setCounts((current) => {
      if (!current) return current;
      if (activeTab === "archived") return { ...current, archivedPlaceCount: Math.max(0, current.archivedPlaceCount - 1), activePlaceCount: current.activePlaceCount + 1 };
      if (activeTab === "hidden") return { ...current, hiddenContentCount: Math.max(0, current.hiddenContentCount - 1) };
      if (activeTab === "candidate" && candidateStatus === "dismissed") return { ...current, candidateCount: Math.max(0, current.candidateCount - 1) };
      return current;
    });
    loadPage({ tab: activeTab, status: activeTab === "candidate" ? candidateStatus : undefined, query: appliedQuery });
  }, [activeTab, appliedQuery, candidateStatus, loadPage]);

  const selectTab = (tab: ManagementTab) => {
    setActiveTab(tab);
    loadPage({ tab, status: tab === "candidate" ? candidateStatus : undefined, query: appliedQuery });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextQuery = query.trim();
    setAppliedQuery(nextQuery);
    loadPage({ tab: activeTab, status: activeTab === "candidate" ? candidateStatus : undefined, query: nextQuery });
  };

  const changeCandidateStatus = (status: CandidateStatus) => {
    setCandidateStatus(status);
    loadPage({ tab: "candidate", status, query: appliedQuery });
  };

  return <section className="admin-card content-management-center" aria-label="地点与内容管理中心">
    <div className="content-management-center__heading"><div><p className="eyebrow">Owner / Admin</p><h2>地点与内容管理</h2><p>支持按状态、关键词和游标分页管理；原始观点、照片与权限边界保持不变。</p></div><Link className="text-button" href="/admin">返回我的</Link></div>
    {counts && <div className="management-counts management-counts--center">{tabs.map((tab) => <button className={activeTab === tab.value ? "is-selected" : ""} key={tab.value} onClick={() => selectTab(tab.value)} type="button"><b>{counts[tab.countKey]}</b><span>{tab.label}</span></button>)}</div>}
    <div className="content-management-center__controls"><div className="content-management-center__tabs" role="tablist" aria-label="管理对象"><button aria-selected={activeTab === "active"} className={activeTab === "active" ? "is-selected" : ""} onClick={() => selectTab("active")} role="tab" type="button">上架中地点</button><button aria-selected={activeTab === "archived"} className={activeTab === "archived" ? "is-selected" : ""} onClick={() => selectTab("archived")} role="tab" type="button">已下架地点</button><button aria-selected={activeTab === "candidate"} className={activeTab === "candidate" ? "is-selected" : ""} onClick={() => selectTab("candidate")} role="tab" type="button">候选地点</button><button aria-selected={activeTab === "hidden"} className={activeTab === "hidden" ? "is-selected" : ""} onClick={() => selectTab("hidden")} role="tab" type="button">隐藏内容</button></div><form className="content-management-center__search" onSubmit={submitSearch}><label><span className="sr-only">搜索地点或地址</span><input aria-label="搜索地点或地址" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} placeholder="搜索地点或地址" /></label><button className="secondary-button" disabled={pending} type="submit">搜索</button></form></div>
    {activeTab === "candidate" && <div className="content-management-center__subtabs" role="group" aria-label="候选状态"><button className={candidateStatus === "pending" ? "is-selected" : ""} onClick={() => changeCandidateStatus("pending")} type="button">待处理</button><button className={candidateStatus === "dismissed" ? "is-selected" : ""} onClick={() => changeCandidateStatus("dismissed")} type="button">已不推荐</button></div>}
    {page.error && <div className="content-management-center__error" role="alert"><p className="form-error">{page.error}</p><button className="secondary-button" disabled={pending} onClick={retryPage} type="button">重试</button></div>}
    {pending && <p className="content-management-center__status" aria-live="polite">正在读取管理列表…</p>}
    {items.length ? <ul className="content-management__list">{items.map((item) => <li key={`${activeTab}-${text(item, activeTab === "candidate" ? "candidate_id" : activeTab === "hidden" ? "content_id" : "group_place_id")}-${activeTab === "hidden" ? text(item, "content_type") : ""}`}><ItemDetails tab={activeTab} item={item} onChanged={reload} /></li>)}</ul> : !pending && !page.error ? <p className="empty-note">{appliedQuery ? "没有找到匹配的地点或地址。" : activeTab === "active" ? "还没有上架中的地点。" : activeTab === "archived" ? "还没有已下架地点。" : activeTab === "candidate" ? candidateStatus === "dismissed" ? "还没有已不推荐的候选。" : "还没有待处理候选。" : "还没有已隐藏内容。"}</p> : null}
    {page.hasMore && <button className="secondary-button content-management-center__load-more" disabled={pending} onClick={() => loadPage({ tab: activeTab, status: activeTab === "candidate" ? candidateStatus : undefined, query: appliedQuery, cursor: page.nextCursor ?? undefined, append: true })} type="button">{pending ? "加载中…" : "加载更多"}</button>}
    <p className="content-management-center__total">当前筛选共 {page.totalCount} 项</p>
  </section>;
}

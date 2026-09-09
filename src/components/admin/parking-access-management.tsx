"use client";

import { useMemo, useState } from "react";
import { grantParkingAccess, revokeParkingAccess } from "@/app/parking/actions";
import type { ParkingAccess, ParkingMember } from "@/lib/parking/types";

function roleLabel(role: ParkingMember["role"]) {
  return role === "owner" ? "Owner" : role === "admin" ? "Admin" : "Member";
}

export function ParkingAccessManagement({ groupId, access, initialMembers }: { groupId: string; access: ParkingAccess; initialMembers: ParkingMember[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const filteredMembers = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-CN");
    if (!keyword) return members;
    return members.filter((member) => `${member.displayName} ${member.email}`.toLocaleLowerCase("zh-CN").includes(keyword));
  }, [members, query]);

  const toggleAccess = async (member: ParkingMember) => {
    setPendingUserId(member.userId);
    setMessage("");
    setError("");
    const result = member.parkingGranted
      ? await revokeParkingAccess({ groupId, userId: member.userId })
      : await grantParkingAccess({ groupId, userId: member.userId });
    setPendingUserId(undefined);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMembers((current) => current.map((item) => item.userId === member.userId ? { ...item, parkingGranted: !member.parkingGranted, grantedAt: member.parkingGranted ? null : new Date().toISOString() } : item));
    setMessage(result.success ?? "已更新停车地图权限。");
  };

  return <section className="admin-card parking-access-card"><div className="parking-access-card__heading"><div><h2>停车地图权限</h2><p>只有指定管理人能在这里授权。授权用户共享查看，但只能编辑和删除自己创建的记录。</p></div><strong>{access.authorizedCount} 人已授权</strong></div>{!access.enabled && <p className="parking-access-card__disabled">停车地图功能开关当前关闭；授权名单可以先维护，开启后才会显示首页入口。</p>}<label className="parking-access-search"><span>从有效成员中添加</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索昵称或账号" /></label>{filteredMembers.length ? <ul className="parking-access-list">{filteredMembers.map((member) => <li key={member.userId}><div><strong>{member.displayName || "未设置昵称"}</strong><small>{roleLabel(member.role)} · {member.email}</small></div><button type="button" className={member.parkingGranted ? "text-button text-button--danger" : "text-button"} disabled={pendingUserId === member.userId} onClick={() => void toggleAccess(member)}>{pendingUserId === member.userId ? "保存中…" : member.parkingGranted ? "撤销权限" : "添加"}</button></li>)}</ul> : <p className="empty-note">没有符合条件的有效成员；管理人不能从名单中撤销自己。</p>}{error && <p className="inline-action__error" role="alert">{error}</p>}{message && <p className="inline-action__success" role="status">{message}</p>}</section>;
}

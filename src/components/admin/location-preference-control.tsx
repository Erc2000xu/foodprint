"use client";

import { useState } from "react";
import { readLocationConsent, writeLocationConsent, type LocationConsent } from "@/lib/discovery/location-session";

export function LocationPreferenceControl({ userId }: { userId: string }) {
  const [consent, setConsent] = useState<LocationConsent>(() => readLocationConsent(userId));

  const update = (next: boolean) => {
    writeLocationConsent(userId, next);
    setConsent(next);
    window.dispatchEvent(new CustomEvent("foodprint:location-preference-changed", { detail: { enabled: next } }));
  };

  return <section className="admin-card location-preference-card" aria-label="隐私与位置">
    <h2>隐私与位置</h2>
    <p>“打开发现时自动定位”只会在当前设备、当前登录状态下请求一次当前位置；坐标不会保存、分享或上传。</p>
    <div className="location-preference-card__row"><strong>{consent === true ? "打开发现时自动定位：已开启" : "打开发现时自动定位：已关闭"}</strong>{consent === true ? <button className="text-button text-button--danger" type="button" onClick={() => update(false)}>关闭</button> : <button className="secondary-button" type="button" onClick={() => update(true)}>开启</button>}</div>
  </section>;
}

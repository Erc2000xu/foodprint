import { describe, expect, it } from "vitest";
import { amapFailureMessage } from "@/lib/amap/failure-message";

describe("AMap failure messages", () => {
  it("keeps provider failure details out of user-facing copy", () => {
    expect(amapFailureMessage("provider_auth_failure")).toBe("地图服务配置需要处理，请稍后再试。");
    expect(amapFailureMessage("10001", "地点搜索服务暂时无法连接。")).toBe("地点搜索服务暂时无法连接。");
  });
});

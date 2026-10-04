import {expect,it,vi} from "vitest";
import {providerFailureKind,SessionProviderError} from "../lib/providerErrors.js";
import {safeError} from "../lib/safeError.js";
it("returns actionable provider failure text without copying upstream secrets",()=>{
  vi.stubEnv("NODE_ENV","production");
  const error=Object.assign(new Error("invalid api key: private-value-that-must-not-escape"),{status:401});
  expect(providerFailureKind(error)).toBe("authentication");
  expect(safeError(error)).not.toContain("private-value");
  expect(safeError(new SessionProviderError())).toContain("Your question has been kept");
  vi.unstubAllEnvs();
});

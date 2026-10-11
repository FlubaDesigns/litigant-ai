import {it,expect,vi,afterEach} from "vitest";
vi.mock("@/lib/firebase",()=>({auth:null}));
vi.mock("@/lib/queryClient",()=>({refreshConfiguration:vi.fn()}));
import {setModelQualityScore} from "./adminService";
afterEach(()=>vi.unstubAllGlobals());
it("sends IQ updates using the backend's score contract",async()=>{
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify({ok:true}),{status:200}));
  vi.stubGlobal("fetch",fetchMock);
  await setModelQualityScore("gpt-4o",91);
  const [url,options]=fetchMock.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toContain("/admin/model-scores/gpt-4o");
  expect(options.method).toBe("PATCH");
  expect(JSON.parse(options.body as string)).toEqual({score:91});
});

it("invalidates customer configuration and quotes only after a successful limit save",async()=>{
  const {setAdminLimit}=await import("./adminService");
  const {refreshConfiguration}=await import("@/lib/queryClient");
  vi.mocked(refreshConfiguration).mockClear();
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response("{}",{status:200})).mockResolvedValueOnce(new Response('{"error":"Invalid limit"}',{status:400})));
  await setAdminLimit("maxLitigants",2);
  expect(refreshConfiguration).toHaveBeenCalledTimes(1);
  await expect(setAdminLimit("maxLitigants",20)).rejects.toThrow("Invalid limit");
  expect(refreshConfiguration).toHaveBeenCalledTimes(1);
});

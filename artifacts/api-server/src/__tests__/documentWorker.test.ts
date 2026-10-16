import {EventEmitter} from "node:events";
import {afterEach,expect,it,vi} from "vitest";
const workers=vi.hoisted(()=>({instances:[] as any[]}));
vi.mock("node:worker_threads",()=>({Worker:class extends EventEmitter {
 terminate=vi.fn(async()=>0);
 constructor(){super();workers.instances.push(this);}
}}));
import {extractDocument} from "../lib/extractDocument.js";
afterEach(()=>{vi.useRealTimers();workers.instances=[];});
it("terminates a stuck parser at the deadline and frees its slot",async()=>{
 vi.useFakeTimers();const task=extractDocument(Buffer.from("pdf"),"pdf",100,new AbortController().signal);
 const check=expect(task).rejects.toThrow("timed out");await vi.advanceTimersByTimeAsync(100);await check;
 expect(workers.instances[0].terminate).toHaveBeenCalledOnce();
});
it("rejects excess concurrency and terminates work on disconnect",async()=>{
 const abort=new AbortController();const a=extractDocument(Buffer.alloc(1),"pdf",1000,abort.signal);
 const b=extractDocument(Buffer.alloc(1),"docx",1000,abort.signal);
 await expect(extractDocument(Buffer.alloc(1),"pdf",1000,abort.signal)).rejects.toThrow("busy");
 const checks=[expect(a).rejects.toThrow("cancelled"),expect(b).rejects.toThrow("cancelled")];abort.abort();await Promise.all(checks);
 expect(workers.instances.every(w=>w.terminate.mock.calls.length===1)).toBe(true);
});

import {beforeEach, describe, expect, it, vi} from "vitest";
import express from "express";
import request from "supertest";
import dns from "node:dns/promises";
import https from "node:https";
import {EventEmitter} from "node:events";
vi.mock("../lib/firebaseAdmin.js", () => ({verifyIdToken:vi.fn(async()=>({uid:"test-user"}))}));
import router from "../routes/caseFile.js";
const app=express();app.use(express.json(),router);
function pdfFixture() {
  const stream="BT /F1 12 Tf 40 750 Td (Verified case file evidence) Tj ET";
  const objects=["<< /Type /Catalog /Pages 2 0 R >>","<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf="%PDF-1.4\n";const offsets=[0];
  objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1)) pdf+=`${String(offset).padStart(10,"0")} 00000 n \n`;
  pdf+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
beforeEach(()=>vi.restoreAllMocks());
describe("case files",()=>{
  it("extracts a real PDF through the installed v2 parser", async()=>{
    const res=await request(app).post("/case-file/upload").set("Authorization","Bearer test").attach("file",pdfFixture(),{filename:"evidence.pdf",contentType:"application/pdf"});
    expect(res.status).toBe(200);expect(res.body.content).toContain("Verified case file evidence");
  });
  it("blocks private addresses before connecting",async()=>{
    vi.spyOn(dns,"lookup").mockResolvedValue({address:"169.254.169.254",family:4} as any);
    const outbound=vi.spyOn(https,"request");
    const res=await request(app).post("/case-file/fetch-url").set("Authorization","Bearer test").send({url:"https://example.com/"});
    expect(res.status).toBe(400);expect(outbound).not.toHaveBeenCalled();
  });
  it("pins the connection to the checked IP while preserving TLS and Host",async()=>{
    vi.spyOn(dns,"lookup").mockResolvedValue({address:"93.184.216.34",family:4} as any);
    const outbound=vi.spyOn(https,"request").mockImplementation(((options:any,callback:any)=>{
      const outgoing=new EventEmitter() as any;
      outgoing.end=()=>{const incoming=new EventEmitter() as any;incoming.statusCode=200;incoming.headers={"content-type":"text/html"};callback(incoming);
        incoming.emit("data",Buffer.from("<title>Evidence</title><p>Source text</p>"));incoming.emit("end");};
      return outgoing;
    }) as any);
    const res=await request(app).post("/case-file/fetch-url").set("Authorization","Bearer test").send({url:"https://example.com/evidence?q=1"});
    expect(res.status).toBe(200);expect(res.body.content).toContain("Source text");
    expect(outbound.mock.calls[0][0]).toMatchObject({hostname:"93.184.216.34",servername:"example.com",path:"/evidence?q=1",headers:{Host:"example.com"}});
  });
  it("keeps truncated uploads within the run request's maximum length",async()=>{
    const res=await request(app).post("/case-file/upload").set("Authorization","Bearer test").attach("file",Buffer.from("evidence ".repeat(2000)),{filename:"evidence.txt",contentType:"text/plain"});
    expect(res.status).toBe(200);expect(res.body.content.length).toBeLessThanOrEqual(12000);
  });
});

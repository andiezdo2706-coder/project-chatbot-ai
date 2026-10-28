// Offline test of the handler with a fake Bedrock client (no AWS credentials needed).
// Run: npm test   (from the lambda/ folder)

import assert from "node:assert/strict";
import { handler, rankSections, SECTIONS } from "./index.mjs";

const fakeClient = {
  async send(command) {
    const system = command.input.system[0].text;
    assert.ok(system.includes("[S5]"), "prompt should contain document sections");
    return {
      output: { message: { content: [{ text: "Cần tích lũy đủ 130 tín chỉ và GPA từ 2,0 [S5]." }] } },
      usage: { inputTokens: 1000, outputTokens: 30 },
    };
  },
};

const post = (body) => ({ requestContext: { http: { method: "POST" } }, body: JSON.stringify(body) });

assert.equal(SECTIONS.length, 10);
assert.equal(rankSections("điều kiện tốt nghiệp")[0].id, "S5");
assert.equal(rankSections("mượn sách thư viện bao lâu")[0].id, "S7");

let res = await handler(post({ question: "Điều kiện tốt nghiệp?" }), {}, { client: fakeClient });
assert.equal(res.statusCode, 200);
let data = JSON.parse(res.body);
assert.deepEqual(data.sources.map((s) => s.id), ["S5"]);
assert.equal(res.headers["Access-Control-Allow-Origin"], "*");

res = await handler(post({}), {}, { client: fakeClient });
assert.equal(res.statusCode, 400);

res = await handler(post({ question: "x".repeat(501) }), {}, { client: fakeClient });
assert.equal(res.statusCode, 400);

const denied = { send: async () => { const e = new Error("no"); e.name = "AccessDeniedException"; throw e; } };
res = await handler(post({ question: "hi" }), {}, { client: denied });
assert.equal(res.statusCode, 403);

res = await handler({ requestContext: { http: { method: "OPTIONS" } } }, {});
assert.equal(res.statusCode, 204);

console.log("All lambda tests passed ✔");

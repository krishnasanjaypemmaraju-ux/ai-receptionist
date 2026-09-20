import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { openGeminiSession } from "./lib/gemini.js";
import { plivoToGemini, geminiToPlivo, b64ToInt16 } from "./lib/audio.js";

const PORT = process.env.PORT || 3000;

// --- in-memory log buffer so we can inspect recent activity via /debug ---
const LOGS = [];
function pushLog(prefix, args) {
  const line = new Date().toISOString().slice(11, 23) + " " + prefix +
    args.map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(" ");
  LOGS.push(line); if (LOGS.length > 400) LOGS.shift();
}
const _log = console.log.bind(console), _err = console.error.bind(console);
console.log = (...a) => { pushLog("", a); _log(...a); };
console.error = (...a) => { pushLog("ERR ", a); _err(...a); };

const app = express();
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.send("Harsha AI receptionist is running."));
app.get("/debug", (req, res) => {
  if (req.query.token !== (process.env.BOOKING_SECRET || "")) return res.status(401).send("unauthorized");
  res.type("text/plain").send(LOGS.slice(-250).join("\n"));
});

// Plivo hits this when a (forwarded) call arrives. We answer and open a bidirectional stream.
function answerXml(host) {
  const scheme = host.startsWith("localhost") ? "ws" : "wss";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000" audioTrack="inbound">${scheme}://${host}/stream</Stream>
</Response>`;
}
app.all("/answer", (req, res) => {
  const host = process.env.PUBLIC_HOST || req.headers.host || `localhost:${PORT}`;
  res.type("application/xml").send(answerXml(host));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/stream" });

wss.on("connection", async (plivoWs) => {
  console.log("[plivo] stream connected");
  let streamId = null;
  let gemini = null;

  const sendToPlivo = (mulawB64) => {
    if (plivoWs.readyState !== plivoWs.OPEN) return;
    plivoWs.send(JSON.stringify({
      event: "playAudio",
      media: { contentType: "audio/x-mulaw", sampleRate: 8000, payload: mulawB64 },
    }));
  };

  try {
    gemini = await openGeminiSession({
      onAudio: (pcm24kB64) => sendToPlivo(geminiToPlivo(pcm24kB64)),
      onInterrupt: () => {
        // caller started talking -> stop whatever the AI was saying
        if (plivoWs.readyState === plivoWs.OPEN) plivoWs.send(JSON.stringify({ event: "clearAudio" }));
      },
      onText: (t) => console.log(t),
      onClose: () => { try { plivoWs.close(); } catch {} },
    });
  } catch (e) {
    console.error("[gemini] failed to open:", e?.message || e);
    plivoWs.close();
    return;
  }

  let mediaCount = 0, loggedFirst = false;
  plivoWs.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.event === "start") { streamId = m.start?.streamId; console.log("[plivo] START:", JSON.stringify(m.start)); return; }
    if (m.event === "media") {
      if (!loggedFirst) { loggedFirst = true; console.log("[plivo] FIRST MEDIA msg:", JSON.stringify(m).slice(0, 300)); }
      mediaCount++;
      if (mediaCount % 50 === 0) console.log("[plivo] media frames:", mediaCount);
      if (m.media?.payload) {
        try {
          const gem = plivoToGemini(m.media.payload);
          gemini.sendAudio(gem);
          if (mediaCount % 50 === 0) {
            const pcm = b64ToInt16(gem); let peak = 0;
            for (let k = 0; k < pcm.length; k++) { const a = Math.abs(pcm[k]); if (a > peak) peak = a; }
            console.log("[audio] frame", mediaCount, "caller peak level:", peak);
          }
        } catch (e) { console.log("[audio] sendAudio err:", e?.message); }
      }
      return;
    }
    if (m.event === "stop") { console.log("[plivo] stop. total media frames:", mediaCount); try { gemini.close(); } catch {} }
  });

  plivoWs.on("close", () => { console.log("[plivo] closed"); try { gemini?.close(); } catch {} });
  plivoWs.on("error", () => { try { gemini?.close(); } catch {} });
});

server.listen(PORT, () => console.log(`Harsha AI receptionist listening on ${PORT}`));

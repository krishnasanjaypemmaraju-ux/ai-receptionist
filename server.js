import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { openGeminiSession } from "./lib/gemini.js";
import { plivoToGemini, geminiToPlivo } from "./lib/audio.js";

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.send("Harsha AI receptionist is running."));

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

  plivoWs.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.event === "start") { streamId = m.start?.streamId; console.log("[plivo] start", streamId); return; }
    if (m.event === "media" && m.media?.payload) {
      try { gemini.sendAudio(plivoToGemini(m.media.payload)); } catch (e) { /* ignore frame */ }
      return;
    }
    if (m.event === "stop") { console.log("[plivo] stop"); try { gemini.close(); } catch {} }
  });

  plivoWs.on("close", () => { console.log("[plivo] closed"); try { gemini?.close(); } catch {} });
  plivoWs.on("error", () => { try { gemini?.close(); } catch {} });
});

server.listen(PORT, () => console.log(`Harsha AI receptionist listening on ${PORT} (host ${HOST})`));

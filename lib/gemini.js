import { GoogleGenAI, Modality } from "@google/genai";
import { functionDeclarations, runTool } from "./tools.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Native-audio Live model available to this API key (great for Telugu voice).
const MODEL = "gemini-2.5-flash-native-audio-latest";

const SYSTEM_PROMPT = `
You are the warm female phone receptionist for "Harsha Multi-Speciality Dental Clinic" in Kakinada.
You speak a natural mix of TELUGU and ENGLISH (Tenglish), the way locals talk. Keep EVERY reply
SHORT (1-2 sentences), friendly and clear. Never sound robotic. Speak a little slowly and warmly.

The clinic: painless dentistry, root canal specialists.
Doctors: Dr. V.S.K. Sri Harsha (Root Canal Specialist) and Dr. V. Sowmya (Cosmetic Dental Surgeon).
Hours: Mon-Sat 9:30 AM-1 PM and 5-9 PM, Sunday by appointment.
Address: Sri Lakshmi Complex, Mosque Street, Suryanarayana Puram, Kakinada.

YOUR JOB - book an appointment by collecting, in order:
1. Name (confirm if unclear)
2. Their dental problem / reason (pain, cleaning, braces, checkup...)
3. Which day and time they prefer.

RULES:
- To find open times, ALWAYS call the tool getAvailability. NEVER invent slots.
- Offer only 2-3 real options in plain words, e.g. "Rey, tomorrow Thursday 5:30 PM or 6 PM unnayi, edi convenient?"
- When they choose, confirm once, then call bookAppointment.
- After a successful booking say (Tenglish): "Booked! [day] [time] ki randi, reception lo mee peru
  cheppandi chaalu. Thank you!" Then politely end the call.
- Do NOT promise any SMS or WhatsApp. They just come and give their name at reception.
- Severe pain / emergency: be caring, offer the EARLIEST slot, or say they can come directly.
- Only discuss the dental clinic. Don't give medical treatment advice - say the doctor will check in person.
- Confirm the caller's phone number before booking.
Begin by greeting them warmly and asking their name.
`;

// Opens a Gemini Live session. Callbacks: onAudio(base64Pcm24k), onInterrupt(), onClose(), onText(txt)
export async function openGeminiSession({ onAudio, onInterrupt, onClose, onText }) {
  let toolBusy = false;   // pause sending caller audio while a tool call is being handled
  let listening = false;  // don't forward caller audio until the greeting finishes
  const session = await ai.live.connect({
    model: MODEL,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      // A calm Indian-English voice; tune later.
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } } },
      // Respond quickly after the caller stops speaking (less lag).
      realtimeInputConfig: {
        automaticActivityDetection: {
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
          silenceDurationMs: 350,
          prefixPaddingMs: 60,
        },
      },
    },
    callbacks: {
      onopen: () => console.log("[gemini] session open"),
      onmessage: async (msg) => {
        // Tool calls
        if (msg.toolCall?.functionCalls?.length) {
          toolBusy = true;
          const responses = [];
          for (const fc of msg.toolCall.functionCalls) {
            console.log("[gemini] tool:", fc.name, JSON.stringify(fc.args));
            const result = await runTool(fc.name, fc.args || {});
            responses.push({ id: fc.id, name: fc.name, response: { result } });
          }
          session.sendToolResponse({ functionResponses: responses });
          setTimeout(() => { toolBusy = false; }, 250);
          return;
        }
        // Barge-in: caller interrupted the AI
        if (msg.serverContent?.interrupted) { onInterrupt?.(); return; }

        // Audio + transcripts
        const parts = msg.serverContent?.modelTurn?.parts || [];
        for (const p of parts) {
          if (p.inlineData?.data) onAudio?.(p.inlineData.data);
        }
        const outTx = msg.serverContent?.outputTranscription?.text;
        if (outTx) onText?.("AI: " + outTx);
        const inTx = msg.serverContent?.inputTranscription?.text;
        if (inTx) onText?.("Caller: " + inTx);
        // once the model finishes a turn (e.g. the greeting), start listening to the caller
        if (msg.serverContent?.turnComplete || msg.serverContent?.generationComplete) {
          if (!listening) console.log("[gemini] now listening to caller");
          listening = true;
        }
      },
      onerror: (e) => console.error("[gemini] ERROR:", e?.message || e?.reason || JSON.stringify(e)),
      onclose: (e) => { console.log("[gemini] closed. code=", e?.code, "reason=", e?.reason); onClose?.(); },
    },
  });

  // Make the AI speak first (greeting) instead of waiting for the caller.
  try {
    session.sendClientContent({
      turns: "A patient has just called the clinic and connected. Greet them warmly in a Telugu+English mix and ask their name.",
      turnComplete: true,
    });
  } catch (e) { console.error("[gemini] greeting trigger failed:", e?.message || e); }

  // safety: if the greeting's turnComplete never arrives, start listening after 6s anyway
  setTimeout(() => { if (!listening) { listening = true; console.log("[gemini] listening (fallback timer)"); } }, 6000);

  return {
    sendAudio: (b64pcm16k) => {
      if (toolBusy || !listening) return;
      session.sendRealtimeInput({ audio: { data: b64pcm16k, mimeType: "audio/pcm;rate=16000" } });
    },
    close: () => session.close(),
  };
}

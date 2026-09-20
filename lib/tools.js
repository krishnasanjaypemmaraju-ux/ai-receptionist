// Functions Gemini can call. They talk to your Google Apps Script web app,
// which reads/writes the appointments Google Sheet.

const URL = process.env.APPS_SCRIPT_URL;
const SECRET = process.env.BOOKING_SECRET || "CHANGE_ME_secret123";

// Tool schemas advertised to Gemini
export const functionDeclarations = [
  {
    name: "getAvailability",
    description:
      "Get the next open clinic days and their free appointment time slots. " +
      "ALWAYS call this before telling the caller any available times. Never invent slots.",
    parameters: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Optional start date in YYYY-MM-DD. Omit for starting today.",
        },
        days: {
          type: "number",
          description: "How many open days to return (default 4).",
        },
      },
    },
  },
  {
    name: "bookAppointment",
    description:
      "Book the appointment into the clinic sheet. Only call after the caller has " +
      "confirmed a specific date and time returned by getAvailability.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Patient's name" },
        phone: { type: "string", description: "Patient's phone number" },
        problem: { type: "string", description: "Reason / dental problem" },
        date: { type: "string", description: "Appointment date YYYY-MM-DD" },
        time: { type: "string", description: "Appointment time HH:mm (24h)" },
      },
      required: ["name", "date", "time"],
    },
  },
];

export async function runTool(name, args) {
  try {
    if (name === "getAvailability") {
      const params = new URLSearchParams({ token: SECRET, action: "availability" });
      if (args?.from) params.set("from", args.from);
      params.set("days", String(args?.days || 4));
      const r = await fetch(`${URL}?${params.toString()}`);
      return await r.json();
    }
    if (name === "bookAppointment") {
      const r = await fetch(URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: SECRET, ...args }),
      });
      return await r.json();
    }
    return { ok: false, error: `unknown tool ${name}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

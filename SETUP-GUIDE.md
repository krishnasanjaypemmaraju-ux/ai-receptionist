# Harsha Dental — AI Phone Receptionist: Setup Guide

**What this is:** when your receptionist doesn't pick up within ~10 seconds (or is busy),
the call forwards to an AI that answers in Telugu+English, checks your Google Sheet for free
slots, books the appointment, and tells the patient to come and give their name at reception.

**Stack (cheapest):** Plivo (phone line) + Google Gemini Live (brain+voice) + Google Sheet (bookings)
+ this connector program. Running cost ≈ **₹400–900/month** for 20–30 AI calls.

Do the steps in order. Steps marked 👤 are yours (need login/payment); ⚙️ I can help with.

---

## STEP 1 — 👤 Get a free Gemini API key (2 min, no card)
1. Go to **https://aistudio.google.com/apikey** → sign in with your Gmail.
2. Click **Create API key** → copy it. (Free tier is enough to start.)

## STEP 2 — 👤 Make the booking Google Sheet
- Follow **appointments-sheet-setup.md** → create the "Harsha Appointments" sheet (3 tabs).

## STEP 3 — 👤 Add the backend script to the sheet
1. In the sheet: **Extensions → Apps Script**.
2. Delete anything there, paste all of **apps-script.gs**, and change `SECRET` to your own
   password (remember it — it must match everywhere).
3. **Deploy → New deployment → type: Web app** → *Execute as: Me*, *Who has access: Anyone* → **Deploy**.
4. Copy the **Web app URL**.

## STEP 4 — ⚙️ Deploy the connector (free host: Render)
1. Create a free account at **https://render.com** (sign in with GitHub or email).
2. **New → Web Service** → connect this folder (I'll push it to GitHub for you) → it auto-detects Node.
   - Build command: `npm install`  •  Start command: `npm start`
3. Add **Environment variables** (from `.env.example`):
   - `GEMINI_API_KEY` = your key (Step 1)
   - `APPS_SCRIPT_URL` = the Web app URL (Step 3)
   - `BOOKING_SECRET` = the same secret you set in the script
   - `PUBLIC_HOST` = the Render URL without `https://` (e.g. `harsha-connector.onrender.com`)
4. Deploy → you get a URL like `https://harsha-connector.onrender.com`.
5. Test it: open `https://harsha-connector.onrender.com/` → should say "running".

## STEP 5 — 👤 Buy the Plivo number & point it at the connector
1. In Plivo → **Phone Numbers → Buy Number** (Voice, India, ₹200/mo) → buy **one**.
2. Create a Plivo **Application**: **Voice → Applications → Add**
   - **Answer URL** = `https://harsha-connector.onrender.com/answer`  (Method: GET)
   - Save.
3. Assign that Application to your new number (number settings → Application).

## STEP 6 — ⚙️👤 Test the AI directly
- From any phone, **call the Plivo number**. The AI should answer and book a test appointment.
- Check the **Appointments** tab — the booking should appear. We tune the voice/Telugu here.

## STEP 7 — 👤 Turn on "forward missed calls to AI"
On the **receptionist's phone** (the SIM that receives 6302962577), dial this once
(replace `<AI-NUMBER>` with the Plivo number in full, e.g. `+912269850489`):

- **Forward on no-answer after 10 sec:**  `**61*<AI-NUMBER>*11*10#`  → press call
- **Forward on busy:**  `**67*<AI-NUMBER>#`  → press call
- (To cancel later: `##61#` and `##67#`.)

If your carrier rejects `10`, try `15` or `20` (must be a multiple of 5, max 30).

✅ Done. Receptionist rings first; unanswered/busy → AI answers and books.

---

## Money summary
- Gemini: free credits first, then ~₹2–4/min of call.
- Plivo number: ~₹200/month + ~₹0.5–1/min.
- Render host: free tier (may cold-start after idle — first call each day waits a few seconds;
  upgrade to ~₹400/month for always-on if you want zero delay).
- **Total ≈ ₹400–900/month** at your volume.

## Things I still need from you to finish wiring
1. Gemini API key (Step 1)
2. Apps Script Web app URL + the SECRET you chose (Step 3)
3. Plivo Auth ID + Auth Token, and the number, once bought (Step 5)
Then I deploy, we call it, and tune the Telugu voice together.

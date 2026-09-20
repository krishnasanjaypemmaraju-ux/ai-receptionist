# Google Sheet setup (2 minutes) — "Harsha Appointments"

Make a new Google Sheet named **Harsha Appointments** with **3 tabs** (exact names).
Copy the header rows exactly. Times are 24-hour **HH:mm**. Dates are **YYYY-MM-DD**.

## Tab 1 — `Hours`   (your weekly working times)
Blank = closed that half-day. Edit to your real hours.

| Day | Open1 | Close1 | Open2 | Close2 |
|-----|-------|--------|-------|--------|
| Monday | 09:30 | 13:00 | 17:00 | 21:00 |
| Tuesday | 09:30 | 13:00 | 17:00 | 21:00 |
| Wednesday | 09:30 | 13:00 | 17:00 | 21:00 |
| Thursday | 09:30 | 13:00 | 17:00 | 21:00 |
| Friday | 09:30 | 13:00 | 17:00 | 21:00 |
| Saturday | 09:30 | 13:00 | 17:00 | 21:00 |
| Sunday |  |  |  |  |

## Tab 2 — `Blocked`   (specific busy times — camps, holidays, lunch, personal)
Leave empty normally. Add rows when the doctor is NOT available on a date/time.

| Date | Start | End | Reason |
|------|-------|-----|--------|
| 2026-09-25 | 11:00 | 13:00 | Dental camp |

## Tab 3 — `Appointments`   (the AI writes here — just keep the header)

| BookedAt | Name | Phone | Problem | Date | Time | Status |
|----------|------|-------|---------|------|------|--------|

That's it. The AI reads Hours − Appointments − Blocked to offer only free 30-minute slots,
and adds each new booking as a row in `Appointments`. You (or the receptionist) can open this
sheet any time to see the day's appointments.

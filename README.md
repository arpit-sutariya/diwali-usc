# Diwali at BAPS Chino Hills · USC bus sign-ups

Sign-up site for the USC bus to Diwali at BAPS Chino Hills on Saturday, November 7, 2026.
Sign-ups close at the end of Tuesday, November 3 (`SIGNUP_DEADLINE` in `lib/core.js` and `signupsClosed` in `index.html`).
Students register (with up to 3 guests), send a $5-per-person refundable deposit by Venmo or Zelle,
and get a QR ticket by email once you confirm their payment.

- Public page: `/`
- Organizer page: `/#organizer` (password protected)

## What you need

- A **GitHub** account (to hold the code)
- A **Vercel** account (sign up with GitHub; free Hobby plan)
- The **Gmail** account you want emails to come from (a personal Gmail works best)

## Setup (about 20 minutes)

### 1. Put the code on GitHub
1. Go to github.com → **New repository** → name it `diwali-usc` → **Private** → **Create repository**.
2. On the new repo page, click **uploading an existing file**.
3. Unzip `diwali-usc.zip` on your computer, open the folder, select **everything inside it**
   (`index.html`, `package.json`, `README.md`, and the `api`, `lib`, `img` folders) and drag it into the page.
4. Click **Commit changes**.

### 2. Create the site on Vercel
1. Go to vercel.com → **Add New… → Project** → **Import** your `diwali-usc` repo.
2. Leave every setting as it is and click **Deploy**. Your site is now at something like `diwali-usc.vercel.app`.
   (It won't save sign-ups until steps 3–5 are done.)

### 3. Add the database (one click)
1. In your Vercel project, open the **Storage** tab → **Create Database** → **Neon** (Serverless Postgres) → **Continue**.
2. Pick the free plan, any region close to Los Angeles (e.g. US West), and **Create**.
3. When asked, **Connect** it to the `diwali-usc` project (all environments). Vercel adds `DATABASE_URL` for you.
   The tables are created automatically on the first visit.

### 4. Turn on emails (Gmail app password)
1. In your Google account, turn on **2-Step Verification** (myaccount.google.com → Security).
2. Go to **myaccount.google.com/apppasswords**, create an app password named `Diwali site`, and copy the 16 letters.
   (USC-managed Google accounts may block app passwords; use a personal Gmail if so.)

### 5. Add the settings in Vercel
Vercel project → **Settings → Environment Variables**. Add these for all environments:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | A password only you know, for `/#organizer` |
| `GMAIL_USER` | The Gmail address emails come from, e.g. `you@gmail.com` |
| `GMAIL_APP_PASSWORD` | The 16-letter app password from step 4 |
| `SITE_URL` *(optional)* | Your final address, e.g. `https://diwali-usc.vercel.app` (used in email links) |

Then **Deployments** → the latest one → **⋯ → Redeploy** so the settings take effect.

### 6. Fill in the trip details
1. Open `https://YOUR-SITE.vercel.app/#organizer` and sign in with `ADMIN_PASSWORD`.
2. Open **Trip settings**: bus seats, deposit, departure time, pickup spot, return time, your Venmo and Zelle,
   your name and phone, and (optionally) the refund policy. **Save settings**.

### 7. Test it once yourself
1. Register on the public page with your own email (try adding a guest).
2. Check your inbox for the "Send your deposit" email with your reference code.
3. In `/#organizer`, press **Confirm payment** on your row → you should get the QR ticket email.
4. Reload the public page: your ticket shows. On the **Check-in** tab, scan it with your phone camera.
5. Press **Mark refunded**, then **Revoke** or **Cancel** your test sign-up so it doesn't take a seat.

Now share the link.

## Running the event

- **Payments:** match each Venmo/Zelle payment to its reference code (e.g. `DIW-4K7Q`), then **Confirm payment**.
  The ticket email goes out automatically (toggle "Email the ticket when I confirm").
- **Seats:** only confirmed people count toward bus seats. When a group doesn't fit, it goes on the waitlist;
  use **Offer a seat** to move them off it.
- **At the bus:** organizer page → **Check-in** → **Scan with camera**. One scan checks in the whole group.
  Without camera access, use **Scan from photo** or type the reference code.
- **Refunds:** after someone checks in (or cancels in time), send their money back to the account in their row,
  then press **Mark refunded**. **Export CSV** gives you the full list with refund details.
- **Lost links:** students can press "Already registered? Get your link by email" on the form.

## Limits worth knowing

- Gmail sends up to about 500 emails a day, which is plenty for one bus.
- The organizer password is shared: anyone with it can confirm payments. Don't post it anywhere.
- Payments are not processed by the site. It only tracks what you confirm.

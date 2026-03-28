# Truth Calendar — Setup Guide

This is a ~30 minute one-time setup. Follow each step in order.

---

## Step 1: Create a Vercel Account

1. Go to https://vercel.com and sign up with GitHub
2. If you don't have a GitHub account, create one at https://github.com first (free)

---

## Step 2: Upload this project to GitHub

1. On GitHub, click **New repository** → name it `truth-calendar` → Create
2. On your computer, open Terminal and run:

```bash
cd ~/Downloads/truth-calendar
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/truth-calendar.git
git push -u origin main
```

---

## Step 3: Deploy to Vercel

1. In Vercel, click **Add New Project** → import your `truth-calendar` repo
2. Click **Deploy** (leave all settings as default for now)
3. Once deployed, copy your app URL (e.g. `https://truth-calendar.vercel.app`)

---

## Step 4: Add a Vercel KV database

1. In your Vercel project dashboard, go to **Storage** → **Create Database** → **KV**
2. Click **Connect** — Vercel auto-adds the KV env vars to your project

---

## Step 5: Set up Google (Calendar + Gmail)

1. Go to https://console.cloud.google.com
2. Create a new project called "Truth Calendar"
3. Enable these APIs: **Google Calendar API** and **Gmail API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `https://YOUR-VERCEL-URL/api/auth/google/callback`
5. Copy your **Client ID** and **Client Secret**

To get your refresh token, visit this URL in your browser (replace CLIENT_ID and REDIRECT_URI):
```
https://accounts.google.com/o/oauth2/auth?client_id=CLIENT_ID&redirect_uri=REDIRECT_URI&response_type=code&scope=https://www.googleapis.com/auth/calendar+https://www.googleapis.com/auth/gmail.readonly+https://www.googleapis.com/auth/gmail.send&access_type=offline&prompt=consent
```
After authorizing, you'll be redirected — copy the `code` from the URL and exchange it:
```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=YOUR_CODE&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&redirect_uri=YOUR_REDIRECT_URI&grant_type=authorization_code"
```
Copy the `refresh_token` from the response.

---

## Step 6: Set up Outlook (optional — skip if not needed)

1. Go to https://portal.azure.com → **App registrations → New registration**
2. Name: "Truth Calendar" · Supported account types: **Personal Microsoft accounts only**
3. Redirect URI: `https://YOUR-VERCEL-URL/api/auth/outlook/callback`
4. Copy **Application (client) ID** and create a **Client secret** under Certificates & secrets
5. Follow the same OAuth flow as Google to get a refresh token, with scopes:
   `https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Mail.Read offline_access`

---

## Step 7: Set up Calendly

1. Go to https://calendly.com/integrations/api_webhooks
2. Click **Personal Access Tokens → Create new token**
3. Copy the token

---

## Step 8: Set up Todoist

1. Go to https://todoist.com/app/settings/integrations/developer
2. Copy your **API token**

---

## Step 9: Set up web research (Serper)

1. Go to https://serper.dev and sign up (free — 2,500 searches/month)
2. Copy your **API key** from the dashboard

---

## Step 10: Add all environment variables to Vercel

1. In your Vercel project, go to **Settings → Environment Variables**
2. Add each variable from `.env.example` with your real values:

| Variable | Where to get it |
|----------|----------------|
| `GOOGLE_CLIENT_ID` | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | `https://your-app.vercel.app/api/auth/google/callback` |
| `GOOGLE_REFRESH_TOKEN` | Step 5 above |
| `OUTLOOK_CLIENT_ID` | Azure Portal (optional) |
| `OUTLOOK_CLIENT_SECRET` | Azure Portal (optional) |
| `OUTLOOK_REFRESH_TOKEN` | Step 6 above (optional) |
| `CALENDLY_API_KEY` | Calendly integrations page |
| `TODOIST_API_TOKEN` | Todoist developer settings |
| `SERPER_API_KEY` | serper.dev dashboard |
| `WEBHOOK_SECRET` | Any random string (e.g. generate at https://generate-secret.vercel.app/32) |
| `NEXT_PUBLIC_APP_URL` | Your Vercel app URL |

3. After adding all variables, click **Redeploy**

---

## Step 11: Register webhooks (enables real-time sync)

After deploying with all env vars, visit this URL to register the webhooks:
```
https://your-app.vercel.app/api/webhooks/register
```

This sets up Google Calendar and Gmail push notifications so your calendar updates instantly.

---

## Step 12: Push notifications (desktop + mobile)

1. Run this once in your terminal to generate VAPID keys:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Add both keys to Vercel's environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — same value as `VAPID_PUBLIC_KEY`)
3. Redeploy
4. Open the app in your browser — it will prompt you to allow notifications. Click **Allow**
5. On mobile: open the app in Safari (iOS) or Chrome (Android) → Share → **Add to Home Screen** → open from home screen → allow notifications

You'll now get a notification 10 minutes before every meeting and again when it starts, on every device where you've opened the app.

---

## Step 13: Granola (automatic meeting recording)

Granola auto-records meetings by listening to your system audio — no extra setup needed if it's already installed. The only thing to confirm:

1. Open Granola → Settings → **Calendar Accounts**
2. Make sure **all** your Google Calendars are connected (not just the primary one)
3. That's it — every meeting in your Truth Calendar will automatically appear in Granola and be recorded

After a meeting ends, the Truth Calendar event card will show a **"View in Granola"** link to open the transcript directly.

---

## You're done!

Visit `https://your-app.vercel.app` — your Truth Calendar is live and accessible from any device.

Bookmark it or add it to your phone's home screen (in Safari/Chrome: Share → Add to Home Screen).

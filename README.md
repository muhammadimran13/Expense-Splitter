# Daily Expense Splitter (MERN)

Admin-managed people, personal accounts, login that never expires.

## Run locally
1. Install Node 18+ and MongoDB (or a free MongoDB Atlas cluster).
2. `cp .env.example .env` and set `MONGO_URI` and a long random `JWT_SECRET`.
3. `npm install && npm start`, then open http://localhost:3000

## How it works
- The **first account registered becomes the admin**. Everyone after is a normal user.
- Users register once; the login token (JWT) has no expiry and is kept in the browser until they tap logout.
- Only the admin can add/remove people and save WhatsApp numbers (numbers are never sent to normal users).
- Any user can add expenses; they can delete their own, the admin can delete any.
- The admin sees "Remind on WhatsApp" buttons on the Settle tab (opens WhatsApp with the message ready to send).

## Deploy
Render/Railway: build `npm install`, start `npm start`, set env vars `MONGO_URI` and `JWT_SECRET`.
Always serve over HTTPS in production. Keep `JWT_SECRET` private: changing it logs everyone out.

## Push to GitHub and deploy on Vercel
1. Create an empty GitHub repo, then: `git init && git add . && git commit -m "Expense splitter" && git branch -M main && git remote add origin <repo-url> && git push -u origin main`
2. vercel.com -> Add New -> Project -> import the repo. Framework Preset: **Other**. Leave build command empty.
3. Add env vars `MONGO_URI` and `JWT_SECRET`, deploy, then register the admin account first.
4. In MongoDB Atlas -> Network Access allow `0.0.0.0/0` (Vercel IPs change).

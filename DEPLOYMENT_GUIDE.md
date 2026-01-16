# VogueFit Deployment Guide

## 1. Prerequisites
*   GitHub Account
*   Render Account (for Backend)
*   Google Chrome Web Store Account (for Extension)

## 2. Push Code to GitHub
Since your code is local, create a new GitHub repository called `vougefit` and push your code:
```bash
# Initialize git if not already
git init

# Create .gitignore in root
echo "node_modules\n.env\ndist\n.DS_Store" > .gitignore

# Add files
git add .
git commit -m "Initial commit of full app"

# Link to GitHub (Replace URL with yours)
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/vougefit.git
git push -u origin main
```

## 3. Deploy Database (Neon.tech or Render)
**Option A: Render Postgres (Easy)**
1.  Go to Render Dashboard -> New -> PostgreSQL.
2.  Name: `vougefit-db`.
3.  Plan: Free.
4.  Copy the `Internal Connection URL` (if deploying backend to Render) or `External Connection URL`.

**Option B: Neon (Better for Scaling)**
1.  Create project on Neon.tech.
2.  Get the Connection String.

## 4. Deploy Backend (Render)
1.  Go to Render Dashboard -> New -> Web Service.
2.  Connect your GitHub Repo `vougefit`.
3.  **Root Directory**: `backend`.
4.  **Build Command**: `npm install && npm run build`.
5.  **Start Command**: `npm start`.
6.  **Environment Variables**:
    *   `DATABASE_URL`: (Paste from Step 3)
    *   `GROQ_API_KEY`: (Your Key)
    *   `RAZORPAY_KEY_ID`: (Your Key)
    *   `RAZORPAY_KEY_SECRET`: (Your Key)
7.  Click **Deploy**.
8.  Once live, copy the URL (e.g., `https://vougefit.onrender.com`).

## 5. Update Extension
1.  Open `extension/src/config.ts`.
2.  Uncomment/Update `API_BASE_URL` with your new Render URL:
    ```typescript
    export const API_BASE_URL = 'https://vougefit.onrender.com';
    ```
3.  Rebuild Extension:
    ```bash
    cd extension
    npm run build
    ```
4.  Test the local extension again to make sure it talks to the live cloud server.

## 6. Publish Extension
1.  Zip the `extension/dist` folder.
2.  Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/dev/dashboard).
3.  Upload the Zip.
4.  Fill in listing details (Title: VogueFit, Desc: AI Stylist).
5.  Submit for Review! 🚀

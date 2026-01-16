# VogueFit Backend - Deployment Guide

## Prerequisites
- Railway account ([railway.app](https://railway.app))
- GitHub repository with this code

## Quick Deploy to Railway

### Step 1: Push to GitHub
```bash
cd /Users/tanvi/vougefit
git add .
git commit -m "Add Docker deployment configuration"
git push origin main
```

### Step 2: Create Railway Project
1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect the Dockerfile

### Step 3: Add PostgreSQL Database
1. In Railway dashboard, click "+ New" → "Database" → "PostgreSQL"
2. Railway auto-sets `DATABASE_URL` environment variable

### Step 4: Configure Environment Variables
In Railway dashboard → Variables, add:

| Variable | Value |
|----------|-------|
| `GROQ_API_KEY` | Your Groq API key |
| `RAZORPAY_KEY_ID` | Your Razorpay key (or `rzp_test_mock`) |
| `RAZORPAY_KEY_SECRET` | Your Razorpay secret (or `secret_mock`) |
| `SCRAPINGBEE_API_KEY` | Optional - for live scraping |

### Step 5: Deploy
Railway will automatically:
1. Build the Docker image
2. Run Prisma migrations
3. Start the server
4. Provide a public HTTPS URL

## Your Public API URL
After deployment, Railway provides a URL like:
```
https://vougefit-backend-production.up.railway.app
```

## Update Extension
In `extension/src/popup/App.tsx`, update:
```typescript
const API_BASE_URL = 'https://YOUR-RAILWAY-URL.up.railway.app';
```

## Verify Deployment
Test these endpoints:
- `GET /` - Should return HTML page
- `POST /api/auth` - Test auth
- `POST /api/suggest` - Test AI (requires user)

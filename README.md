# VogueFit

VogueFit is a browser extension and backend system acting as a personal AI stylist and shopping assistant.

## Architecture

- **Extension**: React (Vite) + TypeScript + Manifest V3
  - Injects into e-commerce sites (e.g., Myntra).
  - Handles DOM parsing and UI overlays.
- **Backend**: Node.js + Express + TypeScript
  - Manages User Data, Credits, and LLM orchestration.
  - Database: PostgreSQL (via Prisma).

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Backend Development**
   ```bash
   npm run dev:backend
   ```

3. **Extension Development**
   ```bash
   npm run build:extension
   # Load the `extension/dist` folder in Chrome (Developer Mode)
   ```

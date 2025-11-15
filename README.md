# AutoFixer

An autonomous bug-fixing and feature-adding agent that listens to GitHub issues and creates Daytona sandboxes for automated fixes.

## Phase 1: GitHub Webhook → Daytona Sandbox Creation

This phase implements:
- GitHub webhook receiver with HMAC signature verification
- Issue parsing and validation
- Automatic Daytona workspace creation

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file (copy from `.env.example` if available) with:
   ```
   GITHUB_TOKEN=your_github_token_here
   WEBHOOK_SECRET=your_webhook_secret_here
   DAYTONA_API_KEY=your_daytona_api_key_here
   DAYTONA_API_URL=https://api.daytona.io
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Expose locally with ngrok:**
   ```bash
   ngrok http 3000
   ```

5. **Configure GitHub Webhook:**
   - Go to your repository → Settings → Webhooks → Add webhook
   - **Payload URL**: `https://your-ngrok-url.ngrok.io/api/github-webhook`
   - **Content type**: `application/json`
   - **Secret**: Same as `WEBHOOK_SECRET` in your `.env`
   - **Events**: Select "Issues" → "Issue opened"

## Project Structure

```
/pages/api/github-webhook.ts  # Webhook endpoint
/lib/github-webhook.ts         # Webhook verification
/lib/issue-parser.ts           # Issue parsing logic
/lib/daytona.ts                # Daytona API client
/lib/db.ts                     # In-memory database
/types/                        # TypeScript type definitions
```

## API Endpoint

- **POST** `/api/github-webhook` - Receives GitHub webhook events

## Next Steps

- [ ] Claude agent integration for analyzing issues
- [ ] BEFORE/AFTER sandbox creation
- [ ] Automated patch generation and application
- [ ] Pull request creation


# Setup Instructions

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
GITHUB_TOKEN=your_github_personal_access_token
WEBHOOK_SECRET=your_random_webhook_secret_string
DAYTONA_API_KEY=your_daytona_api_key
DAYTONA_API_URL=https://api.daytona.io
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Getting the values:

- **GITHUB_TOKEN**: Create a Personal Access Token at https://github.com/settings/tokens
  - Scopes needed: `repo` (for future PR creation)
  
- **WEBHOOK_SECRET**: Generate a random string (you can use `openssl rand -hex 32`)

- **DAYTONA_API_KEY**: Get from your Daytona Cloud account

- **ANTHROPIC_API_KEY**: Get from https://console.anthropic.com/ (for future use)

## 3. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3000`

## 4. Expose with ngrok

In a separate terminal:

```bash
ngrok http 3000
```

Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

## 5. Configure GitHub Webhook

1. Go to your repository on GitHub
2. Navigate to: **Settings** → **Webhooks** → **Add webhook**
3. Configure:
   - **Payload URL**: `https://your-ngrok-url.ngrok.io/api/github-webhook`
   - **Content type**: `application/json`
   - **Secret**: Same value as `WEBHOOK_SECRET` in your `.env`
   - **Which events**: Select "Let me select individual events"
     - Check: ✅ **Issues** → "Issues opened"
   - Click **Add webhook**

## 6. Test

1. Create a new issue in your GitHub repository
2. Check your terminal logs - you should see:
   - "Received issue opened event: #X - [title]"
   - "Creating Daytona workspace for issue #X..."
   - "Workspace created: [workspace-id] - [workspace-name]"
3. Check the webhook delivery in GitHub (Settings → Webhooks → your webhook → Recent Deliveries)

## Troubleshooting

- **Invalid signature**: Make sure `WEBHOOK_SECRET` matches the secret in GitHub webhook settings
- **Daytona API error**: Verify your `DAYTONA_API_KEY` is correct and has proper permissions
- **Port already in use**: Change the port: `npm run dev -- -p 3001`


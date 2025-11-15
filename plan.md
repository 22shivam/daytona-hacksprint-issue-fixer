# AutoFixer: End-to-End Implementation Plan

A precise, step-by-step plan you can follow inside **Cursor** to build your autonomous bug-fixing (or also add features, basically it addresses issues and submits pull request and in pull request includes link the old and new daytona sandboxes) agent with Daytona, GitHub Webhooks, and Claude.

---

# 📦 1. Accounts & Setup Checklist

Before writing code, create these accounts:

### **Required Accounts**

* **GitHub** (for repo + webhook + PRs)
* **Daytona Cloud account** (get API key)
* **Anthropic Claude API key**
* **Vercel** or **Railway** (for hosting your backend)

### **Optional (for extra prizes). WE DO THIS LATER, not now**

* **CodeRabbit** (for PR review)
* **Browser Use** (UI validation)
* **Sentry** (error ingestion + triggers)

Create a `.env` file with:

```
GITHUB_TOKEN=...
DAYTONA_API_KEY=...
ANTHROPIC_API_KEY=...
WEBHOOK_SECRET=...
```

---

# 🏗️ 2. High-Level Architecture

```
GitHub Issue → GitHub Webhook → Backend API
    → Daytona spins BEFORE sandbox
    → Daytona spins AFTER sandbox
    → Claude agent analyzes issue + code
    → Patch applied in AFTER sandbox
    → Tests run
    → Backend creates PR
```

You’ll build three main components:

1. **Webhook Receiver** – triggers when GitHub issue is created
2. **Fix Orchestrator** – spins up Daytona envs + runs agent
3. **PR Generator** – commits patch + opens pull request

---

# ⚙️ 3. Step-by-Step Implementation

## **3.1 Create a GitHub Repo for Demo**

* Use a small, easy repo (e.g., a tiny Next.js app or Node Express app)
* Add an obvious bug to demonstrate
* Enable issues

## **3.2 Add GitHub Webhook**

Go to GitHub repo → Settings → Webhooks → Add Webhook

* **Payload URL**: your backend endpoint
* **Content type**: `application/json`
* **Secret**: same `WEBHOOK_SECRET` used in backend
* **Events**: choose **Issues → "Issue Opened"**

GitHub will POST a payload like:

```
{
  "action": "opened",
  "issue": { "title": "button not clickable", "body": "Repro steps..." },
  "repository": { "clone_url": "..." }
}
```

## **3.3 Build Backend (Node/Express or Next.js API Route)**

Recommended: **Next.js API route** (using ngrok to expose local host).

Create API file:

```
/ pages / api / github-webhook.js
```

Flow:

1. Verify HMAC signature using `WEBHOOK_SECRET`
2. Detect event type = issue opened
3. Extract repo URL + issue text
4. Call the orchestrator function

Webhook handler pseudocode:

```js
export default async function handler(req, res) {
  verifyGithubSignature(req); // implement HMAC check

  if (req.body.action === "opened") {
    const issue = req.body.issue;
    const repo = req.body.repository.clone_url;

    await triggerFixProcess({ issue, repo });
  }

  res.status(200).send("ok");
}
```

---

# 🛠️ 4. Daytona Sandbox Creation

Using Daytona API:

### **4.1 BEFORE sandbox (reproduce bug)**

Purpose: clone repo as-is, run preview server.

```bash
POST https://api.daytona.io/workspaces
```

Body example:

```json
{
  "repository": "<repo_url>",
  "env": "node:latest",
  "name": "before-env"
}
```

### **4.2 AFTER sandbox (apply fix)**

Same call, but name it differently:

```json
{
  "repository": "<repo_url>",
  "env": "node:latest",
  "name": "after-env"
}
```

Store both workspace IDs.

---

# 🤖 5. The Claude Fixing Agent

Process:

1. Load issue title + body
2. Fetch repo file tree from Daytona workspace
3. Claude proposes fix plan
4. Claude writes patch
5. Apply patch in AFTER workspace

### **Agent System Prompt Structure**

* "You are an autonomous bug-fixing agent…"
* Provide issue text
* Provide repo file list
* Provide key file contents
* Ask Claude to:

  * Identify root cause
  * Write detailed patch (diff format)
  * Write test plan

### **Patch Application**

Use Daytona API to execute commands:

```
daytona exec <workspace> --apply-patch 'diff here'
```

Then run tests:

```
daytona exec <workspace> "npm install && npm test"
```

---

# 🔁 6. Create Pull Request

After patch is applied and tests pass:

1. Commit new files inside AFTER workspace
2. Push changes to a new branch
3. Use GitHub API:

```
POST /repos/{owner}/{repo}/pulls
```

Simple payload:

```json
{
  "title": "AutoFixer: Patch for issue #123",
  "body": "This PR was automatically generated.",
  "head": "autofix-branch",
  "base": "main"
}
```

---

# 🧪 7. Optional Integrations

### **CodeRabbit Review**

Call their API with PR URL → display review results.

### **Browser Use**

* Connect to preview URL from Daytona BEFORE & AFTER
* Validate visual behavior

### **Sentry**

* Listen to error spikes
* Trigger new sandbox runs

---

# 📽️ 8. Recommended Demo Script

1. Create a GitHub issue live
2. Watch terminal logs from your backend
3. Show BEFORE/AFTER Daytona workspaces created
4. Show Claude diff output
5. Show PR created in GitHub
6. (Optional) Show UI preview before/after

---

# 🚀 9. Development Flow in Cursor

### **Step-by-step inside Cursor:**

1. Create project folder: `autofixer/`
2. Let Cursor generate:

   * `api/github-webhook.js`
   * `orchestrator.js`
   * `daytona.js` client module
   * `claude-agent.js`
   * `pr.js`
3. Build one function at a time:

   * webhook
   * sandbox creation
   * agent
   * patch apply
   * PR creation

Ask Cursor: *"Write the patch-application function using the Daytona exec API."*

Cursor will auto-adapt.

---

# 🧱 10. Recommended Folder Structure

```
/autofixer
  /pages/api/github-webhook.js
  /lib/orchestrator.js
  /lib/daytona.js
  /lib/claude-agent.js
  /lib/patch.js
  /lib/pr.js
  .env
```

---

# ✔️ 11. What to Build First (Order)

1. GitHub → webhook → backend round trip
2. Daytona sandbox creation
3. Claude agent generating fixes
4. Apply patch in AFTER sandbox
5. Create PR
6. Add polish (Browser Use, logging, safety)

---

# 📦 Final Notes

* Use a *simple demo repo* so fixes are predictable
* Pre-test agent outputs so demo is deterministic
* Keep logs visible for judges
* Keep webhooks & API endpoints public and stable

---

**You can now start coding from top to bottom.**
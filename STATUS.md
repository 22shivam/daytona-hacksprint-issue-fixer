# Project Status: AutoFixer

## ✅ Completed (Phase 1)

### 1. Project Setup
- ✅ Next.js project initialized with TypeScript
- ✅ Project structure created (`/pages/api`, `/lib`, `/types`)
- ✅ Configuration files (tsconfig.json, next.config.js, .gitignore)
- ✅ Package.json with dependencies:
  - `@daytonaio/sdk` - Daytona TypeScript SDK
  - `@octokit/rest` - GitHub API client (for future use)
  - Next.js, React, TypeScript

### 2. GitHub Webhook Integration
- ✅ Webhook endpoint created (`/pages/api/github-webhook.ts`)
- ✅ HMAC signature verification implemented
- ✅ Raw body parsing for signature verification
- ✅ Issue event detection (filters for "opened" events)
- ✅ Error handling and logging

### 3. Issue Parsing
- ✅ Issue parser module (`/lib/issue-parser.ts`)
- ✅ Extracts issue data:
  - Issue number, title, body
  - Repository name, owner, clone URL
  - Default branch, repository URL
- ✅ Validation of parsed issue data

### 4. Daytona Integration
- ✅ Daytona client using official SDK (`/lib/daytona.ts`)
- ✅ Sandbox creation using `daytona.create()`
- ✅ Repository cloning using `sandbox.git.clone()`
- ✅ GitHub token authentication support for private repos
- ✅ Proper path handling (uses sandbox working directory)
- ✅ Labels for tracking (issue number, repository, owner)

### 5. Data Management
- ✅ In-memory database (`/lib/db.ts`)
- ✅ Issue tracking with status (pending, processing, completed, failed)
- ✅ Workspace ID storage

### 6. Type Definitions
- ✅ GitHub webhook types (`/types/github.ts`)
- ✅ Daytona workspace types (`/types/daytona.ts`)

### 7. Documentation
- ✅ README.md with project overview
- ✅ SETUP.md with detailed setup instructions

## 🔄 Current Flow

When a GitHub issue is created:
1. ✅ Webhook receives event
2. ✅ Signature verified (HMAC)
3. ✅ Issue parsed and validated
4. ✅ Issue stored in memory DB
5. ✅ Daytona sandbox created
6. ✅ Repository cloned into sandbox
7. ✅ Workspace ID stored with issue
8. ✅ Success response returned

## ❌ Not Yet Implemented (Future Phases)

### Phase 2: BEFORE/AFTER Sandboxes
- ❌ Create "BEFORE" sandbox (current state of repo)
- ❌ Create "AFTER" sandbox (for applying fixes)
- ❌ Store both sandbox IDs
- ❌ Link sandboxes to issue

### Phase 3: Claude Agent Integration
- ❌ Claude API client setup
- ❌ Issue analysis prompt
- ❌ Code context extraction from sandbox
- ❌ Root cause identification
- ❌ Fix plan generation
- ❌ Patch generation (diff format)

### Phase 4: Patch Application
- ❌ Apply patch to AFTER sandbox
- ❌ Execute commands in sandbox (using `sandbox.process.executeCommand()`)
- ❌ Run tests
- ❌ Validate fix

### Phase 5: Pull Request Creation
- ❌ Commit changes in AFTER sandbox
- ❌ Push to new branch
- ❌ Create PR using GitHub API
- ❌ Include links to BEFORE/AFTER sandboxes in PR description
- ❌ Link PR to original issue

### Phase 6: Optional Enhancements
- ❌ CodeRabbit integration for PR review
- ❌ Browser Use for UI validation
- ❌ Sentry integration for error tracking
- ❌ Database migration (from in-memory to persistent DB)
- ❌ Better error recovery
- ❌ Retry logic for failed operations

## 📋 Next Steps (Priority Order)

### Immediate Next Steps:
1. **Test current implementation**
   - Set up `.env` with API keys
   - Start dev server
   - Configure GitHub webhook
   - Test with a real issue

2. **Create BEFORE sandbox** (Phase 2)
   - Modify `createWorkspace` to create BEFORE sandbox
   - Store BEFORE sandbox ID

3. **Create AFTER sandbox** (Phase 2)
   - Create separate AFTER sandbox
   - Store AFTER sandbox ID
   - Both should clone the same repository

4. **Claude Agent Setup** (Phase 3)
   - Initialize Anthropic client
   - Create system prompt for bug fixing
   - Extract code context from BEFORE sandbox
   - Generate fix plan

5. **Apply Fixes** (Phase 4)
   - Use Claude-generated patch
   - Apply to AFTER sandbox
   - Run tests to validate

6. **Create PR** (Phase 5)
   - Commit changes
   - Push branch
   - Open pull request

## 🐛 Known Issues / Considerations

1. **In-memory database**: Data is lost on server restart
   - Consider migrating to a persistent database (PostgreSQL, MongoDB, etc.)

2. **Error handling**: Basic error handling in place, but could be more robust
   - Add retry logic for API calls
   - Better error messages
   - Dead letter queue for failed issues

3. **Authentication**: GitHub token handling for private repos
   - Currently supports token in URL or username/password
   - May need refinement based on actual SDK behavior

4. **Sandbox cleanup**: No automatic cleanup of sandboxes
   - Consider auto-delete intervals
   - Cleanup old sandboxes periodically

5. **Language detection**: Currently doesn't detect project language
   - Could analyze repository to determine language
   - Set appropriate sandbox image/language

6. **Rate limiting**: No rate limiting implemented
   - GitHub API has rate limits
   - Daytona API may have rate limits
   - Consider implementing queuing system

## 📝 Environment Variables Required

```env
GITHUB_TOKEN=your_github_personal_access_token
WEBHOOK_SECRET=your_random_webhook_secret
DAYTONA_API_KEY=your_daytona_api_key
DAYTONA_API_URL=https://api.daytona.io (optional)
ANTHROPIC_API_KEY=your_anthropic_api_key (for Phase 3)
```

## 🎯 Success Criteria for Phase 1

- ✅ GitHub webhook receives issue events
- ✅ Issue data is correctly parsed
- ✅ Daytona sandbox is created
- ✅ Repository is cloned into sandbox
- ✅ Issue is tracked in memory DB

## 📊 Architecture Summary

```
GitHub Issue Created
    ↓
GitHub Webhook → /api/github-webhook
    ↓
HMAC Verification
    ↓
Issue Parser → Extract Issue Data
    ↓
In-Memory DB → Store Issue
    ↓
Daytona Client → Create Sandbox
    ↓
Sandbox.git.clone() → Clone Repository
    ↓
Store Workspace ID
    ↓
Return Success Response
```

---

**Last Updated**: Phase 1 Complete
**Next Phase**: Phase 2 - BEFORE/AFTER Sandboxes


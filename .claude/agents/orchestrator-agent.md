---
name: orchestrator-agent
description: Pipeline Orchestrator for CSTS — sequentially run all seven phases from Requirement Analysis through Maintenance.
---

# Pipeline Orchestrator — CSTS Full Lifecycle

## Role
Coordinator agent that manages the end-to-end Customer Support Ticket System (CSTS) pipeline by sequentially invoking each phase agent and gating on human approval.

## Triggers
Activate on user messages containing:
- "orchestrate pipeline"
- "run full pipeline"
- "start pipeline"
- "execute all phases"

## Instructions

### Pre-Execution Checks
- Ensure the following environment variables are set:
  - JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY
  - CONFLUENCE_BASE_URL, CONFLUENCE_SPACE_KEY
  - GITHUB_TOKEN (for pushing code and opening PRs)
  - FIGMA_API_TOKEN (if embedding Figma designs) or mermaid support enabled
- Ensure the local Git working directory is clean and on the intended branch.
- Prompt the user: "Type `ready` to confirm prerequisites or `abort <reason>` to exit."

### Connectivity Checks
- Git: run `git ls-remote $(git remote get-url origin)` to verify network and remote accessibility.
- JIRA: send GET to `${JIRA_BASE_URL}/rest/api/3/myself` using Basic Auth from `JIRA_EMAIL` and `JIRA_API_TOKEN`.
- Confluence: send GET to `${CONFLUENCE_BASE_URL}/wiki/rest/api/space?limit=1` using Basic Auth.
- GitHub: send GET to `https://api.github.com/user` with header `Authorization: token ${GITHUB_TOKEN}`.
- Figma (if used): send GET to `https://api.figma.com/v1/files` with header `X-Figma-Token: ${FIGMA_API_TOKEN}`.
- Record each check result; if any fail, prompt the user: "Connection to [service] failed with error: <error>. Type `retry` to re-run checks or `abort <reason>` to exit."
- Ensure the following environment variables are set:
  - JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY
  - CONFLUENCE_BASE_URL, CONFLUENCE_SPACE_KEY
  - GITHUB_TOKEN (for pushing code and opening PRs)
  - FIGMA_API_TOKEN (if embedding Figma designs) or mermaid support enabled
- Ensure the local Git working directory is clean and on the intended branch.
- Prompt the user: "Type `ready` to confirm prerequisites or `abort <reason>` to exit."


0. Enhancement Retrieval
   - Send a message to **confluence-requirements-agent**: "fetch enhancement text".
   - Wait for and relay enhancement text to the user; append it to `run<TIMESTAMP>.md`.
   - Provide the enhancement content as context for the Requirement Analysis phase.

**Failure Handling:**
- If any phase invocation fails (agent error, timeout, or missing `... COMPLETE` summary), prompt the user:
  "Phase [Phase Name] failed. Type `retry` to retry this phase, `skip` to proceed to the next phase, or `abort <reason>` to terminate the pipeline."
- Based on the user's response, retry the current phase, skip to the next phase, or end orchestration.


1. Requirement Analysis
   - Send a message to **1-requirement-analysis-agent**: "start requirement analysis"
     with the instruction to parse Gherkin scenarios from the fetched Confluence enhancement text. Append the parsed scenarios grouped into feature-based Epics to `run<TIMESTAMP>.md` before creating JIRA issues.
   - After completion, extract created JIRA issue keys and project board URL. Append these to `run<TIMESTAMP>.md` and share the JIRA board link with the user.
   - Use enhancement content fetched in step 0 as the source.
   - Send a message to **1-requirement-analysis-agent**: "start requirement analysis"
      - Wait for and relay its completion summary (`REQUIREMENT ANALYSIS COMPLETE ...`).
   - Prompt the user: "Type `approve` to proceed to App Analysis or `reject <reason>` to abort."
   - On `approve`, continue; on `reject`, terminate orchestration.

2. App Analysis
   - Send a message to **2-app-analysis-agent**: "start app analysis"
   - Append JIRA link summary to `run<TIMESTAMP>.md` after completion
   - Send a message to **app-analysis-agent**: "start app analysis"
   - Wait for and relay its completion summary (`APP ANALYSIS COMPLETE ...`).
   - Prompt for user approval as above.

3. Design
   - Send a message to **design-agent**: "start design"
   - Wait for and relay its completion summary (`DESIGN PHASE COMPLETE ...`).
   - Prompt for approval.

4. Development
   - Send a message to **development-agent**: "start development"
   - Wait for and relay its completion summary (`DEVELOPMENT PHASE COMPLETE ...`).
   - Prompt for approval.

5. Testing
   - Send a message to **testing-agent**: "start testing"
   - Wait for and relay its completion summary (`TESTING PHASE COMPLETE ...`).
   - Prompt for approval.

6. Deployment
   - Send a message to **deployment-agent**: "start deployment"
   - Wait for and relay its completion summary (`DEPLOYMENT PHASE COMPLETE ...`).
   - Prompt for approval.

7. Maintenance
   - Send a message to **maintenance-agent**: "start maintenance"
   - Wait for and relay its completion summary (`MAINTENANCE PHASE COMPLETE`).
   - No further approval required — orchestration ends.

## Execution Logging
- Create a markdown file named `run<TIMESTAMP>.md` in the repository root at the start of orchestration. The `<TIMESTAMP>` should use `YYYYMMDDHHmmss` format.
- Append each phase invocation command, phase summary output, user approval or skip/abort responses, and the final maintenance summary to this file.

## Quick Reference Table
| Phase                 | Agent                       | Message                   |
|-----------------------|-----------------------------|---------------------------|
| Requirement Analysis  | requirement-analysis-agent  | "start requirement analysis" |
| App Analysis          | app-analysis-agent         | "start app analysis"    |
| Design                | design-agent                | "start design"           |
| Development           | development-agent           | "start development"      |
| Testing               | testing-agent               | "start testing"          |
| Deployment            | deployment-agent            | "start deployment"       |
| Maintenance           | maintenance-agent           | "start maintenance"      |

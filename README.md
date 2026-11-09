# SolMarrow for GitHub Actions

Post to your social accounts from a workflow, for example every time you publish a release. By default the action
saves a **draft** in SolMarrow so you can look at it first; switch `mode` to `schedule` or `publish` when you trust it.

## Set up (2 minutes)

1. In SolMarrow open **Settings → API keys**, create a key for the workspace you post from, and copy it.
2. In your GitHub repository add it as a secret named `SOLMARROW_API_KEY` (Settings → Secrets and variables → Actions).
3. Add the workflow below. The workspace ID and account IDs are in SolMarrow (Settings → API keys shows the workspace;
   account IDs come from `GET /api/v1/workspaces/<id>/accounts` or the MCP tool `list_accounts`).

```yaml
on:
  release:
    types: [published]
jobs:
  announce:
    runs-on: ubuntu-latest
    steps:
      - uses: solmarrow-app/post@v1
        with:
          api-key: ${{ secrets.SOLMARROW_API_KEY }}
          workspace-id: ${{ vars.SOLMARROW_WORKSPACE_ID }}
          text: |
            {{repo}} {{tag}} is out!
            {{url}}
```

## Inputs

| Input | Required | What it does |
|---|---|---|
| `api-key` | yes | Your SolMarrow API key (`smk_…`). Keep it in a secret. |
| `workspace-id` | yes | The workspace the key belongs to. |
| `account-ids` | for `schedule` / `publish` | Accounts to post to, separated by commas or new lines. |
| `text` | no | Post text. Fields: `{{name}}` `{{tag}}` `{{url}}` `{{repo}}` `{{body}}` `{{author}}`. Default: `{{repo}} {{tag}} is out! {{url}}`. |
| `mode` | no | `draft` (default), `schedule` or `publish`. |
| `schedule-at` | for `schedule` | ISO 8601 time with an offset, at least 5 minutes ahead. |
| `schedule-in-minutes` | alternative | Minutes from now (5 or more). |
| `media-urls` | no | Public https links to images or videos, one per line. |
| `per-account-text` | no | JSON `{"<account id>": "text"}` for different text on some accounts. |

## Outputs

`post-id` (the post in SolMarrow) and `status` (`draft`, `scheduled` or `published`).

## Good to know

- Re-running the same workflow run does not post twice (the action sends an idempotency key).
- A key works in one workspace only and stops working the moment you delete it in SolMarrow.
- Each network's own rules apply; if text is too long for a network SolMarrow says so in the job log.
- Posts to X use X credits unless the workspace has its own X key. Daily limits follow your SolMarrow plan.
- No dependencies and no data sent anywhere except `app.solmarrow.com`.

MIT licence. Help: support@solmarrow.com · API: https://solmarrow.com/developers

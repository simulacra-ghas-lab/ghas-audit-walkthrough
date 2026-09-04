# GHAS Audit Walkthrough

A synthetic repository for demonstrating where GHAS, SCA, and vulnerability
tracking sit in the development lifecycle. Everything here is fake: the
credentials authenticate to nothing, the vulnerable code is never deployed, and
the ServiceNow records are GitHub Issues.

Built to rehearse the five-stage walkthrough:
developer change → push → pull request → finding/tracking → merge and release.

---

## What is real and what is standing in

Be explicit about this during the demo. An auditor who later discovers a
substitution you didn't mention will discount everything else you showed.

| Control | Here | Reality |
| --- | --- | --- |
| SAST | CodeQL, `security-extended` | Same product |
| Secret detection | GitHub secret scanning + push protection | Same product, but **self-service bypass here vs. delegated (approval-gated) bypass in most enterprise setups** — see Stage 2b |
| Merge gating | Repository ruleset, applied by safe-settings | Same mechanism |
| SCA | Dependabot + `dependency-review-action` | **Sonatype** — same control shape, different policy engine |
| Vulnerability tracking | GitHub Issue via `mock-servicenow-vr.yml` | **ServiceNow VR** — no instance is contacted |

The two substitutions are unavoidable outside a licensed environment. Both are
labelled in the workflow files themselves.

---

## The planted findings

| # | Finding | Detected by | Where |
| --- | --- | --- | --- |
| 1 | AWS credential pair | Secret scanning + push protection | added live in Stage 2 |
| 2 | Command injection via `req.query.host` | CodeQL `js/command-line-injection` | `src/server.js` |
| 3 | `lodash@4.17.15`, `minimist@1.2.0` | Dependabot / dependency review | `package.json` |

No credential is committed to this repository. Finding 1 is generated and added
live in Stage 2, so the audience watches the preventive control reject it in
real time -- a stronger demonstration than a repository that has already leaked,
and it means this repo never carries a credential-shaped string.

---

## Stage 1 — Developer creates a change

Show the two findings already in the source -- the injection and the vulnerable
dependencies. Nothing has run yet; this is the "before" state. The credential
arrives in Stage 2.

```bash
git checkout -b feature/audit-demo

# Add a dependency with known critical advisories.
npm pkg set dependencies.handlebars=4.0.5
git commit -am "Add handlebars for template rendering"
```

Point at `src/server.js` and `package.json`. Note that `src/config.js` reads
credentials from the environment -- the clean pattern, before the demo breaks it.

**Why the dependency is added here rather than already present:**
`dependency-review-action` only inspects the *diff*. Vulnerable packages already
on `main` never trip it -- verified, it reports "did not detect any vulnerable
packages" while the Security tab shows ten. The SCA gate only fires on
dependencies the pull request introduces. Worth knowing before an auditor asks
why a repo full of vulnerabilities has a passing SCA check.

**Auditor will ask:** *does anything stop the developer writing this?*
Honest answer: nothing stops them writing it. The controls are detective from
here forward, plus one preventive control at push time. That distinction is
worth stating plainly — it is the shape of the whole programme.

---

## Stage 2 — Commit and push

### 2a. The preventive control

Generate a synthetic credential in the AWS key format and commit it. Generating
it means nothing credential-shaped is ever stored in this repository, and the
value is provably random rather than a real key someone might recognise:

```bash
# Base32 alphabet (A-Z, 2-7). This matters -- see below.
FAKE_ID="AKIA$(LC_ALL=C tr -dc 'A-Z2-7' </dev/urandom | head -c 16)"
FAKE_SECRET="$(LC_ALL=C tr -dc 'A-Za-z0-9+/' </dev/urandom | head -c 40)"

cat >> src/config.js <<EOF

// Added live during the demo. Synthetic -- authenticates to nothing.
const legacyAccessKeyId = '$FAKE_ID'
const legacySecretAccessKey = '$FAKE_SECRET'
EOF

git add src/config.js && git commit -m "Add legacy integration key"
git push origin feature/audit-demo
```

> **Both lines are required, and the alphabet matters.** This was verified the
> hard way. A key ID alone does not trigger push protection, no matter how well
> formed. A key ID built from `A-Z0-9` does not trigger it either, because real
> AWS key IDs are base32 and `0`, `1`, `8`, `9` never appear in them. Only the
> base32 ID *paired* with a 40-character secret is detected, as
> `Amazon AWS Access Key ID` **and** `Amazon AWS Secret Access Key`.
>
> Get this wrong and the push simply succeeds, in front of your audience, with
> no error to explain it. Rehearse this step specifically.

The push is **rejected** at the git layer. This is the strongest moment in the
walkthrough — the finding never reaches the server.

**What the developer sees:** a block message naming the secret type, the file,
the line, and a URL to either remove the secret or request a bypass.

### 2b. The bypass path

Push protection has **two modes**, and they give opposite answers to the
question an auditor is about to ask. Know which one you are demonstrating.

| | Self-service bypass | Delegated bypass |
| --- | --- | --- |
| Who decides | The developer | A designated approver group |
| After choosing a reason | Push proceeds immediately | Push stays blocked, pending review |
| Available on | Any repo with push protection | GHAS / enterprise configuration |

This lab runs the **self-service** mode, because that is what a Free-plan
organization gets. Most enterprise configurations run **delegated bypass**, so
rehearse the narration for the mode you will actually be presenting.

#### Self-service (what this lab shows)

Follow the unblock URL and choose a reason — used in tests, false positive, or
I'll fix it later — and the push then proceeds. The bypass is recorded with the
actor, reason, and timestamp, and raises an alert to security.

#### Delegated bypass (what an enterprise setup shows)

The developer **cannot unblock themselves**. Choosing a reason submits a
*request*; the push stays blocked until someone in the approver group approves
or denies it. On approval the developer re-pushes. On denial the secret has to
come out.

**Show the dialog through the web editor, not the CLI.** From the command line
this is a wall of `remote:` output plus a URL. Committing the file through the
GitHub web UI produces the actual modal, which is what the audience wants to
look at. Say which surface you are showing, since the developer's real workflow
is the CLI.

**Auditor will ask:** *can a developer bypass this?*

Under delegated bypass the answer is **no — they can only request one**, and
that is a genuinely stronger control than most teams can claim. Say it plainly,
then show the approver group.

Have these four ready, because they are configuration facts rather than product
behaviour and they are where the questions go next:

1. **Who is in the approver group**, and what it takes to get added
2. **What the developer sees on denial**
3. **Whether the request and the approval both land in the org audit log** —
   confirm this before the call rather than asserting it live
4. **Whether approval grants a time window or a single push**

> **Segregation of duties — expect this one.** Where the approver group is
> org owners plus security managers, org owners are typically members *by
> default* rather than by explicit grant. That means a developer who is also an
> org owner could approve their own bypass request. Whether that is a real
> exposure depends on how many org owners there are and whether any of them
> commit application code. Have the org-owner count and that answer ready;
> being the one who raises it reads far better than being the one who gets
> caught by it.

### 2c. What runs on push

CodeQL runs on push to `main` and on pull requests. Show
`.github/workflows/codeql.yml` and the Actions tab.

---

## Stage 3 — Pull request creation

```bash
gh pr create --fill
```

Three checks appear:

| Check | Behaviour |
| --- | --- |
| CodeQL | Annotates the injection inline on the diff |
| Dependency Review | Fails the PR on the vulnerable packages, comments a summary |
| Ruleset gate | Blocks merge until code scanning results exist and are clean |

**Findings surfaced in the PR:** the CodeQL alert appears as an inline
annotation on the exact line, not just as a check summary. Show the annotation,
then the "Show paths" view — the data-flow trace from `req.query.host` to
`exec` is what distinguishes SAST from grep, and auditors respond to it.

**Auditor will ask:** *can developers bypass the findings?*
Three separate answers, and they are worth separating:

0. **Note the gate is diff-scoped** — the `code_scanning` rule blocks on alerts the
   pull request *introduces*. Pre-existing alerts on `main` do not block unrelated
   pull requests, which is why routine maintenance here still merges cleanly.
1. **Dismiss the alert** — possible, requires a reason, recorded, alert stays visible as dismissed
2. **Bypass the ruleset** — only for actors in `bypass_actors`; currently empty
3. **Merge anyway** — not possible while the ruleset is `active` and the check is required

---

## Stage 4 — Findings and vulnerability tracking

### How findings are presented

Three surfaces, in the order a developer meets them:

1. **Inline in the PR** — annotation on the line
2. **Security tab** — the alert list, with severity, rule, and state
3. **Notifications** — to the developer and to the security team

Show the Security tab: `Code scanning` and `Dependabot` hold findings from the
start; `Secret scanning` populates once you take the bypass in Stage 2b, which
is worth pointing out -- the alert exists *because* someone overrode a control.

### When the vulnerability record is created

Trigger the mock integration:

```bash
gh workflow run mock-servicenow-vr.yml
```

An Issue appears formatted as a VR record: number, state, CVE, severity, SLA
days, due date, configuration item, affected asset, assignment group.

Worth knowing, and worth saying if asked: **Actions cannot be triggered by a
security alert.** `on: code_scanning_alert` is not a valid trigger -- a workflow
declaring one fails to compile. So this polls the alert APIs, which is also how
the real integration behaves: ServiceNow VR pulls from GitHub or receives a
webhook server-side. It does not run inside Actions.

**One token caveat**, and it will bite you in the bank sandbox too: the default
`GITHUB_TOKEN` can read code scanning alerts but **not** Dependabot or secret
scanning alerts -- both return `Resource not accessible by integration`
regardless of the `permissions:` block. To have all three feed the VR queue,
create a fine-grained PAT with *Dependabot alerts: read* and *Secret scanning
alerts: read* and store it as a `VR_TOKEN` secret. Without it the workflow still
runs and raises records for CodeQL findings only.

**Say clearly:** this is a stand-in. In production the ServiceNow VR GitHub
integration creates a Vulnerable Item and starts the SLA clock. What is
faithful here is the *timing and the payload* — which fields cross the
boundary, and at what moment.

**Auditor will ask:** *at what point is the record created?*
On alert creation, not on merge. A finding that is never merged still produces
a record. That is usually the answer they are probing for, because it
determines whether the vulnerability inventory reflects intent or production.

---

## Stage 5 — Merge and release

### What prevents progression

The repository ruleset, managed as code by safe-settings:

| Rule | Effect |
| --- | --- |
| `code_scanning` | Blocks merge on CodeQL alerts at high or above / error level |
| `required_status_checks` | Makes the SCA gate binding rather than advisory |
| `pull_request` | No direct pushes to `main` |
| `deletion`, `non_fast_forward` | Branch cannot be deleted or force-pushed |

Show that the ruleset is not clicked in by an administrator but declared in the
`admin` repository and applied by safe-settings. For an audit, provenance of
the control matters as much as the control: there is a reviewed commit behind
it, and drift is corrected automatically.

**A distinction auditors reward:** a failing check and a *blocking* check are
not the same thing. Before `review` was added to `required_status_checks`, the
dependency-review job failed loudly on the pull request and the merge button
stayed enabled -- `mergeable=MERGEABLE, state=UNSTABLE`. Adding it flips the
state to `BLOCKED`. If asked "does this stop a release?", that field is the
evidence, not the red X.

### Exceptions and bypasses

- `bypass_actors` — empty here; in production this is the list to scrutinise
- `enforcement: evaluate` — logs without blocking, used when rolling out
- Alert dismissal — recorded with actor and reason

**Auditor will ask:** *who can grant an exception?*
Point at `bypass_actors` in the config, and at the pull request that would be
required to change it. That is the strongest control story in this walkthrough:
the exception list is itself under change control.

### Then fix it

```bash
git revert HEAD          # or remove the secret and bump the dependencies
```

Re-run and show the checks going green, the alert closing, and — in a real
integration — the VR record moving to Resolved.

---

## Replicating this in another org

Nothing here is bound to a particular org.

1. Create a repository from these files. **Public** if the org has no GHAS
   licences — CodeQL, secret scanning, push protection and dependency review
   are free on public repositories, and licensed on private ones.
2. Enable the features:

   ```bash
   ORG=your-org REPO=ghas-audit-walkthrough
   gh api -X PATCH repos/$ORG/$REPO -f 'security_and_analysis[secret_scanning][status]=enabled'
   gh api -X PATCH repos/$ORG/$REPO -f 'security_and_analysis[secret_scanning_push_protection][status]=enabled'
   ```

3. Let CodeQL run once so the Security tab is populated.
4. Apply the ruleset — either through safe-settings, or directly:

   ```bash
   gh api -X POST repos/$ORG/$REPO/rulesets --input ruleset.json
   ```

5. Make the SCA gate binding by adding the dependency-review job to the
   ruleset's `required_status_checks`. Otherwise it fails visibly but blocks
   nothing.
6. **Rehearse the whole path once before presenting.** Push protection has to
   actually fire, and a failed demo of a preventive control reads worse than
   not demonstrating it.

### Things verified here that cost time to discover

| Behaviour | Consequence |
| --- | --- |
| Actions cannot be triggered by `code_scanning_alert`, `secret_scanning_alert` or `dependabot_alert` | A workflow declaring one fails to compile with zero jobs. Poll the APIs instead. |
| `GITHUB_TOKEN` cannot read Dependabot or secret scanning alerts | Returns `Resource not accessible by integration` regardless of `permissions:`. Needs a PAT. |
| An AWS key ID alone never trips push protection | Must be paired with a 40-character secret access key. |
| AWS key IDs are base32 | A random `A-Z0-9` string silently matches nothing. |
| `dependency-review-action` is diff-scoped | Pre-existing vulnerable packages never fail a pull request. |
| A failing check is not a blocking check | Requires `required_status_checks` to actually gate the merge. |

### If the target org already uses safe-settings

Adding a ruleset to config makes safe-settings authoritative for that
repository's rulesets and it will delete any it does not know about. Export
what exists first and confirm a dry run reports no changes.

---

## Notes for the bank sandbox

- **Use synthetic code only.** Nothing from a real repository, including names.
- Sonatype will replace the dependency-review job. The demo narrative is
  unchanged: an SCA policy evaluated on the diff, failing the PR on threshold.
- ServiceNow VR replaces the mock workflow. The integration is configured in
  ServiceNow, not here, so confirm in advance who can show that screen.
- Confirm the real answers before the call, because they will differ from this
  lab: who is in `bypass_actors`, what the remediation SLA actually is, whether
  release pipelines gate on GHAS or only on Sonatype, and who can dismiss an
  alert. Rehearse the walkthrough here; source the facts from production.

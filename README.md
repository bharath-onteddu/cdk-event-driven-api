# cdk-event-driven-api

Production-ready event-driven serverless API on AWS using CDK v2 (TypeScript).

## TL;DR

### Local deploy

```bash
git clone https://github.com/bharath1394/cdk-event-driven-api.git
cd cdk-event-driven-api/infra
npm install
./build.sh --no-deploy
npx cdk deploy
```

### PR command deploy/destroy

- `/run:cdk,deploy` -> CDK diff + deploy from PR head commit
- `/run:cdk,destroy` -> CDK destroy from PR head commit

Both workflows require approval via the `approval` environment.

---

## Architecture

```text
POST /api -> API Gateway -> Lambda (ApiHandler)
                          -> SNS Topic (order-events)
                             -> SQS Queue 1 (DLQ) -> Lambda Consumer1 -> DynamoDB
                             -> SQS Queue 2 (DLQ) -> Lambda Consumer2 -> DynamoDB
```

Key patterns:
- SNS fan-out -> parallel SQS processing
- Retry + DLQ (`maxReceiveCount: 3`)
- Request tracing via `requestId`
- CloudWatch logs and metrics

---

## Prerequisites

```bash
npm i -g aws-cdk
aws configure
cdk bootstrap
```

---

## Local Usage

### Deploy

```bash
cd infra
npm install
./build.sh --no-deploy
npx cdk synth
npx cdk deploy
```

### Destroy

```bash
cd infra
npx cdk destroy --all
```

### Get API endpoint output

```bash
aws cloudformation describe-stacks \
  --stack-name EventDrivenApiStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue"
```

---

## GitHub Actions Usage

### Commands on PR comments

- `/run:cdk,deploy`
- `/run:cdk,destroy`

### Workflow behavior

1. Triggered from PR comment command.
2. Resolves PR head SHA and checks out that exact commit.
3. Runs CDK steps from `infra/`.
4. Waits for environment approval (`approval`).
5. Continues to deploy or destroy.

### Workflow files

- `.github/workflows/cdk-diff-deploy.yml`
- `.github/workflows/reusable-cdk-diff-deploy.yml`
- `.github/workflows/cdk-destroy.yml`
- `.github/workflows/reusable-cdk-destroy.yml`

---

## GitHub Setup Required

### Secrets

Repository secrets used by workflows:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`

### Environment approval

Create environment `approval` and configure Required Reviewers.

### Actions permissions (recommended for public repo)

- Set `Settings -> Actions -> General -> Workflow permissions` to read-only.
- Use restricted actions policy (allow your org + selected actions).

---

## Security Model

Current controls in workflows:
- Only trusted commenters can trigger (`OWNER`, `MEMBER`, `COLLABORATOR`).
- Fork PRs are blocked before deploy/destroy.
- Minimal token permissions: `contents: read`, `pull-requests: read`.
- Environment approval gate required before deploy/destroy jobs.

---

## Test End-to-End

```bash
API_URL="https://abc123.execute-api.region.amazonaws.com/prod/"

curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{"data": "Production order #1"}'
```

Expected response:

```json
{
  "message": "Request published successfully",
  "requestId": "abc-123-def-456"
}
```

Verify DynamoDB writes:

```bash
aws dynamodb scan --table-name order-events --limit 2
```

---

## Troubleshooting

### PR comment command does not trigger

- Workflow files must exist on default branch (`main`).
- Comment must be exactly command-prefixed (`/run:cdk,deploy` or `/run:cdk,destroy`).
- Comment author must be `OWNER`, `MEMBER`, or `COLLABORATOR`.

### Workflow waits or never waits for approval

- Ensure environment is named `approval`.
- Ensure `approval` has Required Reviewers configured.

### `Resource not accessible by integration` (403)

- Usually missing token scope for an API action.
- Current deploy/destroy workflows avoid issue-comment writes and use minimal required scopes.

---

## Project Structure

```text
cdk-event-driven-api/
├── infra/
│   ├── bin/
│   ├── lib/
│   ├── service/
│   ├── build.sh
│   ├── cdk.json
│   └── package.json
├── .github/workflows/
└── README.md
```

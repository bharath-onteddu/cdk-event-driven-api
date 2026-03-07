# cdk-event-driven-api
Serverless event-driven REST API on AWS using CDK — API Gateway, Lambda, SNS/SQS fan-out, DynamoDB, and CloudWatch observability.
Production-ready event-driven serverless API on AWS using CDK v2 (TypeScript). API Gateway → Lambda → SNS/SQS fan-out → consumer Lambdas → DynamoDB, with full CloudWatch observability. Multi-stack design with CDK Pipelines for CI/CD.

## Architecture

[image:95]

**Flow**: API Gateway receives POST → Lambda publishes to SNS → SNS fans out to 2 SQS queues (with DLQ + maxReceiveCount:3) → 2 Lambda consumers → DynamoDB writes → CloudWatch audit trail.
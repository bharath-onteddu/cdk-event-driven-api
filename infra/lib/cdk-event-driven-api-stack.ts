import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigw from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as snssubs from 'aws-cdk-lib/aws-sns-subscriptions'; 

export class CdkEventDrivenApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. SNS Topic (fan-out hub)
    const orderTopic = new sns.Topic(this, 'OrderTopic', {
      topicName: 'order-events',
      displayName: 'Order Events Fanout',
    });

    // 2. SQS Queues + Consumer Lambdas
    const consumerQueue1 = new sqs.Queue(this, 'ConsumerQueue1', {
      queueName: 'consumer-queue-1',
      retentionPeriod: cdk.Duration.days(7),
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'Consumer1DLQ', {
          queueName: 'consumer1-dlq',
          retentionPeriod: cdk.Duration.days(14),
        }),
        maxReceiveCount: 3,
      },
    });

    const consumerQueue2 = new sqs.Queue(this, 'ConsumerQueue2', {
      queueName: 'consumer-queue-2',
      retentionPeriod: cdk.Duration.days(7),
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'Consumer2DLQ', {
          queueName: 'consumer2-dlq',
          retentionPeriod: cdk.Duration.days(14),
        }),
        maxReceiveCount: 3,
      },
    });

    const consumer1 = new lambda.Function(this, 'Consumer1', {
      functionName: 'order-consumer-1',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const dynamo = new AWS.DynamoDB.DocumentClient();

        exports.handler = async (event) => {
          console.log('Consumer 1 processing:', JSON.stringify(event, null, 2));
          
          const records = event.Records.map(record => {
            const body = JSON.parse(record.body);
            return dynamo.put({
              TableName: process.env.ORDER_TABLE_NAME,
              Item: {
                requestId: body.requestId,
                processedBy: 'Consumer1',
                timestamp: body.timestamp,
                 body.data,
              },
            }).promise();
          });

          await Promise.all(records);
          return { processed: records.length, queue: 'Consumer1' };
        };
      `),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        ORDER_TABLE_NAME: 'TODO: reference table name',
      },
    });

    const consumer2 = new lambda.Function(this, 'Consumer2', {
      functionName: 'order-consumer-2',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const dynamo = new AWS.DynamoDB.DocumentClient();

        exports.handler = async (event) => {
          console.log('Consumer 2 processing:', JSON.stringify(event, null, 2));
          
          const records = event.Records.map(record => {
            const body = JSON.parse(record.body);
            return dynamo.put({
              TableName: process.env.ORDER_TABLE_NAME,
              Item: {
                requestId: body.requestId,
                processedBy: 'Consumer2',
                timestamp: body.timestamp,
                 body.data,
              },
            }).promise();
          });

          await Promise.all(records);
          return { processed: records.length, queue: 'Consumer2' };
        };
      `),
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        ORDER_TABLE_NAME: 'TODO: reference table name',
      },
    });

    // Wire SNS → SQS
    orderTopic.addSubscription(new snssubs.SqsSubscription(consumerQueue1));
    orderTopic.addSubscription(new snssubs.SqsSubscription(consumerQueue2));
    

    // SQS → Lambda
    consumerQueue1.grantConsumeMessages(consumer1);
    consumerQueue2.grantConsumeMessages(consumer2);

    // 3. DynamoDB Table
    const orderTable = new dynamodb.Table(this, 'OrderTable', {
      tableName: 'order-events',
      partitionKey: { name: 'requestId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    // Grant consumers table access
    orderTable.grantWriteData(consumer1);
    orderTable.grantWriteData(consumer2);

    // 4. API Gateway + Lambda (entry point)
    const apiHandler = new lambda.Function(this, 'ApiHandler', {
      functionName: 'api-handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          const body = JSON.parse(event.body || '{}');
          const message = {
            requestId: event.requestContext.requestId,
            timestamp: new Date().toISOString(),
             body.data || 'Hello World',
          };

          const snsParams = {
            TopicArn: '${orderTopic.topicArn}',
            Message: JSON.stringify(message),
          };

          await sns.publish(snsParams).promise();
          
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              message: 'Request published successfully', 
              requestId: message.requestId 
            }),
          };
        };
      `),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        SNS_TOPIC_ARN: orderTopic.topicArn,  // ✅ Fixed: direct reference
        ORDER_TABLE_NAME: orderTable.tableName,  // ✅ Fixed: direct reference
      },
    });

    const api = new apigw.RestApi(this, 'EventDrivenApi', {
      restApiName: 'Event-Driven API',
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
      },
    });

    const postIntegration = new apigw.LambdaIntegration(apiHandler);
    api.root.addMethod('POST', postIntegration);

    // Outputs
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: api.url,
      description: 'POST requests to this URL to trigger event flow',
    });

    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: orderTopic.topicArn,
    });

    new cdk.CfnOutput(this, 'OrderTableName', {
      value: orderTable.tableName,
    });
  }
}

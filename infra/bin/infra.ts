#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkEventDrivenApiStack } from '../lib/cdk-event-driven-api-stack';

const app = new cdk.App();
new CdkEventDrivenApiStack(app, 'CdkEventDrivenApiStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
});
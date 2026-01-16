import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoDbStackProps extends cdk.StackProps {
  readonly environmentName: string;
}

/**
 * DynamoDB Tables Stack
 * 
 * Creates:
 * - demo-sessions table with GSI for questionnaire queries
 * - demo-responses table for storing survey responses
 * - demo-transcripts table with TTL for automatic cleanup
 * - On-demand billing mode for cost optimization
 * - Point-in-time recovery enabled for data protection
 * 
 * Requirements: 15.1, 15.2, 15.3
 */
export class DynamoDbStack extends cdk.Stack {
  public readonly sessionsTable: dynamodb.Table;
  public readonly responsesTable: dynamodb.Table;
  public readonly transcriptsTable: dynamodb.Table;
  public readonly analyticsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDbStackProps) {
    super(scope, id, props);

    // Create demo-sessions table
    // Stores session metadata and state
    this.sessionsTable = new dynamodb.Table(this, 'SessionsTable', {
      tableName: `${props.environmentName}-demo-sessions`,
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // On-demand billing
      pointInTimeRecovery: true, // Enable PITR for data protection
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Retain table on stack deletion
      encryption: dynamodb.TableEncryption.DEFAULT, // Use default encryption
      
      // Enable TTL for automatic deletion after 90 days
      timeToLiveAttribute: 'ttl',
      
      // Stream configuration for real-time processing (optional)
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add GSI for querying sessions by questionnaire
    this.sessionsTable.addGlobalSecondaryIndex({
      indexName: 'questionnaireId-startTime-index',
      partitionKey: {
        name: 'questionnaireId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'startTime',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create demo-responses table
    // Stores individual question responses
    this.responsesTable = new dynamodb.Table(this, 'ResponsesTable', {
      tableName: `${props.environmentName}-demo-responses`,
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'questionId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.DEFAULT,
      
      // Enable TTL for automatic deletion after 90 days
      timeToLiveAttribute: 'ttl',
      
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Add GSI for querying responses by question
    this.responsesTable.addGlobalSecondaryIndex({
      indexName: 'questionId-timestamp-index',
      partitionKey: {
        name: 'questionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Create demo-transcripts table
    // Stores conversation transcripts with TTL
    this.transcriptsTable = new dynamodb.Table(this, 'TranscriptsTable', {
      tableName: `${props.environmentName}-demo-transcripts`,
      partitionKey: {
        name: 'sessionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'timestamp',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.DEFAULT,
      
      // Enable TTL for automatic deletion after 90 days
      timeToLiveAttribute: 'ttl',
      
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Create demo-analytics table
    // Stores aggregated analytics data by date and questionnaire
    this.analyticsTable = new dynamodb.Table(this, 'AnalyticsTable', {
      tableName: `${props.environmentName}-demo-analytics`,
      partitionKey: {
        name: 'date',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'questionnaireId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      encryption: dynamodb.TableEncryption.DEFAULT,
      
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    // Output table information
    new cdk.CfnOutput(this, 'SessionsTableName', {
      value: this.sessionsTable.tableName,
      description: 'Sessions Table Name',
      exportName: `${props.environmentName}-SessionsTableName`,
    });

    new cdk.CfnOutput(this, 'SessionsTableArn', {
      value: this.sessionsTable.tableArn,
      description: 'Sessions Table ARN',
      exportName: `${props.environmentName}-SessionsTableArn`,
    });

    new cdk.CfnOutput(this, 'ResponsesTableName', {
      value: this.responsesTable.tableName,
      description: 'Responses Table Name',
      exportName: `${props.environmentName}-ResponsesTableName`,
    });

    new cdk.CfnOutput(this, 'ResponsesTableArn', {
      value: this.responsesTable.tableArn,
      description: 'Responses Table ARN',
      exportName: `${props.environmentName}-ResponsesTableArn`,
    });

    new cdk.CfnOutput(this, 'TranscriptsTableName', {
      value: this.transcriptsTable.tableName,
      description: 'Transcripts Table Name',
      exportName: `${props.environmentName}-TranscriptsTableName`,
    });

    new cdk.CfnOutput(this, 'TranscriptsTableArn', {
      value: this.transcriptsTable.tableArn,
      description: 'Transcripts Table ARN',
      exportName: `${props.environmentName}-TranscriptsTableArn`,
    });

    new cdk.CfnOutput(this, 'AnalyticsTableName', {
      value: this.analyticsTable.tableName,
      description: 'Analytics Table Name',
      exportName: `${props.environmentName}-AnalyticsTableName`,
    });

    new cdk.CfnOutput(this, 'AnalyticsTableArn', {
      value: this.analyticsTable.tableArn,
      description: 'Analytics Table ARN',
      exportName: `${props.environmentName}-AnalyticsTableArn`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Project', 'Voiceter');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}

import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface S3StackProps extends cdk.StackProps {
  readonly environmentName: string;
}

/**
 * S3 Bucket Stack
 * 
 * Creates:
 * - voiceter-demo-recordings bucket for audio storage
 * - Versioning enabled for data protection
 * - AES-256 encryption at rest
 * - Lifecycle policy to delete recordings after 90 days
 * 
 * Requirements: 16.1, 16.4, 16.5
 */
export class S3Stack extends cdk.Stack {
  public readonly recordingsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3StackProps) {
    super(scope, id, props);

    // Create S3 bucket for audio recordings
    this.recordingsBucket = new s3.Bucket(this, 'RecordingsBucket', {
      bucketName: `${props.environmentName}-voiceter-demo-recordings`,
      
      // Enable versioning for data protection
      versioned: true,
      
      // Enable encryption at rest with AES-256
      encryption: s3.BucketEncryption.S3_MANAGED,
      
      // Block all public access - only IAM roles can access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      
      // Enforce SSL/TLS for all requests
      enforceSSL: true,
      
      // Lifecycle policy to delete recordings after 90 days
      lifecycleRules: [
        {
          id: 'DeleteOldRecordings',
          enabled: true,
          expiration: cdk.Duration.days(90),
          noncurrentVersionExpiration: cdk.Duration.days(90),
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
      
      // Retain bucket on stack deletion (set to DESTROY for dev/test)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false, // Set to true for dev/test environments
      
      // Enable server access logging for audit trail
      serverAccessLogsPrefix: 'access-logs/',
      
      // Enable object lock for compliance (optional)
      // objectLockEnabled: true,
      
      // CORS configuration for frontend access (if needed)
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ['*'], // Restrict to specific origins in production
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    });

    // Add bucket policy to enforce encryption
    this.recordingsBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'DenyUnencryptedObjectUploads',
        effect: cdk.aws_iam.Effect.DENY,
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['s3:PutObject'],
        resources: [this.recordingsBucket.arnForObjects('*')],
        conditions: {
          StringNotEquals: {
            's3:x-amz-server-side-encryption': 'AES256',
          },
        },
      })
    );

    // Add bucket policy to enforce SSL/TLS
    this.recordingsBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'DenyInsecureTransport',
        effect: cdk.aws_iam.Effect.DENY,
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['s3:*'],
        resources: [
          this.recordingsBucket.bucketArn,
          this.recordingsBucket.arnForObjects('*'),
        ],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
      })
    );

    // Output bucket information
    new cdk.CfnOutput(this, 'RecordingsBucketName', {
      value: this.recordingsBucket.bucketName,
      description: 'Recordings Bucket Name',
      exportName: `${props.environmentName}-RecordingsBucketName`,
    });

    new cdk.CfnOutput(this, 'RecordingsBucketArn', {
      value: this.recordingsBucket.bucketArn,
      description: 'Recordings Bucket ARN',
      exportName: `${props.environmentName}-RecordingsBucketArn`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Project', 'Voiceter');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}

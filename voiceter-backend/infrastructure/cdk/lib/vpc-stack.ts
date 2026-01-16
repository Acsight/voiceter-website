import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';

export interface VpcStackProps extends cdk.StackProps {
  readonly environmentName: string;
}

/**
 * VPC and ECS Cluster Stack
 * 
 * Creates:
 * - VPC with 2 Availability Zones
 * - Public and private subnets
 * - NAT Gateways for private subnet internet access
 * - ECS Cluster with container insights enabled
 * 
 * Requirements: 20.2, 20.3
 */
export class VpcStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    // Create VPC with 2 AZs
    // Public subnets for ALB, private subnets for ECS tasks
    this.vpc = new ec2.Vpc(this, 'VoiceterVPC', {
      vpcName: `${props.environmentName}-voiceter-vpc`,
      maxAzs: 2,
      natGateways: 2, // One NAT gateway per AZ for high availability
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Add VPC Flow Logs for security monitoring
    this.vpc.addFlowLog('VpcFlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    // Create ECS Cluster with container insights
    this.cluster = new ecs.Cluster(this, 'VoiceterCluster', {
      clusterName: `${props.environmentName}-voiceter-cluster`,
      vpc: this.vpc,
      containerInsights: true, // Enable CloudWatch Container Insights
    });

    // Output VPC and Cluster information
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${props.environmentName}-VpcId`,
    });

    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      description: 'ECS Cluster Name',
      exportName: `${props.environmentName}-ClusterName`,
    });

    new cdk.CfnOutput(this, 'ClusterArn', {
      value: this.cluster.clusterArn,
      description: 'ECS Cluster ARN',
      exportName: `${props.environmentName}-ClusterArn`,
    });

    // Tag all resources for cost tracking and organization
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Project', 'Voiceter');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}

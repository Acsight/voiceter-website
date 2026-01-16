import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface AlbStackProps extends cdk.StackProps {
  readonly environmentName: string;
  readonly vpc: ec2.IVpc;
  readonly certificateArn?: string; // Optional SSL certificate ARN
}

/**
 * Application Load Balancer Stack
 * 
 * Creates:
 * - Application Load Balancer with HTTPS listener
 * - Target group with health check configuration
 * - Sticky sessions enabled (1 hour duration)
 * - WebSocket support with 300s idle timeout
 * 
 * Requirements: 20.3
 */
export class AlbStack extends cdk.Stack {
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;
  public readonly targetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: AlbStackProps) {
    super(scope, id, props);

    // Create Application Load Balancer
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'VoiceterALB', {
      loadBalancerName: `${props.environmentName}-voiceter-alb`,
      vpc: props.vpc,
      internetFacing: true, // Public-facing ALB
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC, // Deploy in public subnets
      },
      http2Enabled: true, // Enable HTTP/2 for better performance
      deletionProtection: false, // Set to true in production
    });

    // Create Target Group with health check
    this.targetGroup = new elbv2.ApplicationTargetGroup(this, 'VoiceterTargetGroup', {
      targetGroupName: `${props.environmentName}-voiceter-tg`,
      vpc: props.vpc,
      port: 8080,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      deregistrationDelay: cdk.Duration.seconds(30), // Drain connections for 30s
      
      // Health check configuration
      healthCheck: {
        enabled: true,
        path: '/health',
        protocol: elbv2.Protocol.HTTP,
        port: '8080',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: '200',
      },

      // Enable sticky sessions for WebSocket connections
      // Session affinity ensures WebSocket connections stay with same backend
      stickinessCookieDuration: cdk.Duration.hours(1), // 1 hour sticky session
      stickinessCookieName: 'VOICETER_SESSION',
    });

    // Note: ECS service will be attached to this target group in the ECS stack
    // to avoid circular dependency

    // Create HTTPS listener if certificate is provided
    if (props.certificateArn) {
      const certificate = acm.Certificate.fromCertificateArn(
        this,
        'Certificate',
        props.certificateArn
      );

      this.listener = this.loadBalancer.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        defaultTargetGroups: [this.targetGroup],
        sslPolicy: elbv2.SslPolicy.RECOMMENDED, // Use recommended SSL policy
      });

      // Add HTTP listener that redirects to HTTPS
      this.loadBalancer.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: 'HTTPS',
          port: '443',
          permanent: true,
        }),
      });
    } else {
      // Create HTTP listener for development/testing
      this.listener = this.loadBalancer.addListener('HttpListener', {
        port: 80,
        protocol: elbv2.ApplicationProtocol.HTTP,
        defaultTargetGroups: [this.targetGroup],
      });
    }

    // Configure connection settings for WebSocket support
    // Set idle timeout to 300 seconds (5 minutes) for long-lived WebSocket connections
    this.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');
    this.targetGroup.setAttribute('stickiness.enabled', 'true');
    this.targetGroup.setAttribute('stickiness.type', 'lb_cookie');
    this.targetGroup.setAttribute('stickiness.lb_cookie.duration_seconds', '3600');
    
    // Configure ALB attributes for WebSocket
    this.loadBalancer.setAttribute('idle_timeout.timeout_seconds', '300'); // 5 minutes
    this.loadBalancer.setAttribute('routing.http2.enabled', 'true');

    // Output ALB information
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: this.loadBalancer.loadBalancerDnsName,
      description: 'Load Balancer DNS Name',
      exportName: `${props.environmentName}-LoadBalancerDNS`,
    });

    new cdk.CfnOutput(this, 'LoadBalancerArn', {
      value: this.loadBalancer.loadBalancerArn,
      description: 'Load Balancer ARN',
      exportName: `${props.environmentName}-LoadBalancerArn`,
    });

    new cdk.CfnOutput(this, 'TargetGroupArn', {
      value: this.targetGroup.targetGroupArn,
      description: 'Target Group ARN',
      exportName: `${props.environmentName}-TargetGroupArn`,
    });

    // Output the URL to access the service
    const protocol = props.certificateArn ? 'https' : 'http';
    const port = props.certificateArn ? '' : ':80';
    new cdk.CfnOutput(this, 'ServiceUrl', {
      value: `${protocol}://${this.loadBalancer.loadBalancerDnsName}${port}`,
      description: 'Service URL',
      exportName: `${props.environmentName}-ServiceUrl`,
    });

    // Tag all resources
    cdk.Tags.of(this).add('Environment', props.environmentName);
    cdk.Tags.of(this).add('Project', 'Voiceter');
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
  }
}

import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as iot from "aws-cdk-lib/aws-iot";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";
import { createResourceName } from "../../util/resource";

export interface IoTEdgeServerMonitorConstructProps {
  stage: string;
  /** 監視対象デバイスが属する IoT Thing Group 名 */
  thingGroupName: string;
  /** CloudWatch カスタムメトリクスの名前空間 */
  metricsNamespace: string;
}

/**
 * IoTEdgeServerMonitorConstruct
 *
 * IoT Core ライフサイクルイベントを使って、
 * 指定した Thing Group に属するエッジサーバーの起動/停止を監視する。
 *
 * ─ フロー ─
 *   IoT Core (全デバイスの接続/切断を自動検知)
 *     └─► $aws/events/presence/connected|disconnected/+
 *           └─► IoT Topic Rule（全イベントを受信）
 *                 └─► Lambda
 *                       ├─ Thing Group メンバーシップを確認
 *                       ├─ グループ外 → スキップ
 *                       └─ グループ内 → CloudWatch メトリクス (EdgeServerConnected: 1|0)
 */
export class IoTEdgeServerMonitorConstruct extends Construct {
  public readonly connectedMetric: cloudwatch.MathExpression;

  constructor(
    scope: Construct,
    id: string,
    props: IoTEdgeServerMonitorConstructProps,
  ) {
    super(scope, id);

    const { stage, thingGroupName, metricsNamespace } = props;

    // ── Lambda: ライフサイクルイベントを CloudWatch へ PUT ──────────
    const lifecycleLambda = new NodejsFunction(this, "LifecycleHandler", {
      functionName: createResourceName("edge-lifecycle", stage),
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(
        __dirname,
        "../../src/lambda/edgeServerLifecycle/handler.ts",
      ),
      handler: "handler",
      timeout: cdk.Duration.seconds(10),
      environment: {
        METRICS_NAMESPACE: metricsNamespace,
        ENVIRONMENT: stage,
        THING_GROUP_NAME: thingGroupName,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    lifecycleLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: {
          StringEquals: { "cloudwatch:namespace": metricsNamespace },
        },
      }),
    );

    lifecycleLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["iot:ListThingsInThingGroup"],
        resources: ["*"],
      }),
    );

    // ── IoT Rule: 全デバイスのライフサイクルイベントを受信 ───────────
    const ruleRole = new iam.Role(this, "IoTRuleRole", {
      assumedBy: new iam.ServicePrincipal("iot.amazonaws.com"),
    });
    lifecycleLambda.grantInvoke(ruleRole);

    new iot.CfnTopicRule(this, "LifecycleRule", {
      ruleName: createResourceName("edge-lifecycle", stage, true),
      topicRulePayload: {
        description: "エッジサーバーの接続/切断イベントを Lambda へ転送",
        sql: "SELECT *, topic(4) as eventType, clientId FROM '$aws/events/presence/+/+'",
        awsIotSqlVersion: "2016-03-23",
        actions: [{ lambda: { functionArn: lifecycleLambda.functionArn } }],
        errorAction: {
          cloudwatchLogs: {
            logGroupName: `/aws/iot/rule-errors/${stage}`,
            roleArn: ruleRole.roleArn,
          },
        },
      },
    });

    lifecycleLambda.addPermission("IoTInvoke", {
      principal: new iam.ServicePrincipal("iot.amazonaws.com"),
    });

    // ── ダッシュボード用メトリクス ────────────────────────────────
    // SEARCH + FILL でデバイスごとの接続状態ラインを表示
    this.connectedMetric = new cloudwatch.MathExpression({
      expression: `FILL(SEARCH('{${metricsNamespace},Environment,DeviceId} EdgeServerConnected', 'Maximum', 60), REPEAT)`,
      label: "エッジサーバー接続状態",
      period: cdk.Duration.minutes(1),
    });
  }
}

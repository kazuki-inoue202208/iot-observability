import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as iot from "aws-cdk-lib/aws-iot";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as path from "path";
import { createResourceName } from "../../util/resource";

export interface IoTMetricsConstructProps {
  stage: string;
}

/**
 * アラーム・ダッシュボードで共有する基底メトリクス定義（8個）
 *
 * 統計値・ラベル・色の派生は使う側で `.with()` を呼び出す。
 *   例: metrics.deviceTemperature.with({ statistic: "Maximum", label: "最高温度" })
 */
export interface IoTMetrics {
  activeDeviceCount: cloudwatch.Metric;
  /** SEARCH 式: デバイスごとに 1 本の線を描くグラフ用 */
  deviceTemperatureSearch: cloudwatch.MathExpression;
  /** Environment ディメンションのみ: 標準 Metric Alarm 用。Maximum で全デバイス最高値を取得 */
  deviceTemperatureForAlarm: cloudwatch.Metric;
  receivedMessageCount: cloudwatch.Metric;
}

/**
 * IoTMetricsConstruct
 *
 * IoT Core からデバイスメッセージを受け取り、
 * CloudWatch カスタムメトリクスとして記録する基盤。
 *
 * ─ フロー ─
 *   IoT Device (MQTT)
 *     └─► IoT Topic Rule  ($aws/rules/iot_metrics)
 *           └─► Lambda (put_metric_data)  → CloudWatch Metrics
 */
export class IoTMetricsConstruct extends Construct {
  /** CloudWatch カスタムメトリクスの名前空間 */
  public readonly metricsNamespace: string;
  /** アラーム・ダッシュボードで共有するメトリクスオブジェクト */
  public readonly metrics: IoTMetrics;

  constructor(scope: Construct, id: string, props: IoTMetricsConstructProps) {
    super(scope, id);

    const { stage } = props;
    this.metricsNamespace = `IoT/${stage}`;

    // ── CloudWatch メトリクス定義（アラーム・ダッシュボードで共有） ──
    const namespace = this.metricsNamespace;
    const dim = { dimensionsMap: { Environment: stage } };
    const p5 = cdk.Duration.minutes(5); // アラーム・グラフの標準集計周期
    const p1 = cdk.Duration.minutes(1); // ダッシュボード「直近1分」の集計周期（receivedMessageCount で使用）

    this.metrics = {
      // メッセージを送信してきたデバイスを1カウント。5分間の Sum = アクティブ台数の概算
      activeDeviceCount: new cloudwatch.Metric({
        namespace,
        metricName: "ActiveDeviceCount",
        statistic: "Sum",
        period: p5,
        ...dim,
      }),
      // DeviceId ディメンション付きメトリクスを全デバイス分取得。グラフにデバイスごとの線を描く
      deviceTemperatureSearch: new cloudwatch.MathExpression({
        expression: `SEARCH('{${namespace},Environment,DeviceId} DeviceTemperature', 'Average', 300)`,
        label: "デバイス温度",
        period: p5,
      }),
      // Environment ディメンションのみ。複数デバイスの値が同一メトリクスに集まり Maximum で全台最高値を取得できる
      deviceTemperatureForAlarm: new cloudwatch.Metric({
        namespace,
        metricName: "DeviceTemperature",
        statistic: "Maximum",
        period: p5,
        ...dim,
      }),
      // period: p1 により、ダッシュボードの SingleValueWidget が「直近1分間の合計件数」を表示する
      receivedMessageCount: new cloudwatch.Metric({
        namespace,
        metricName: "ReceivedMessageCount",
        statistic: "Sum",
        period: p1,
        ...dim,
      }),
    };

    // ── Lambda: カスタムメトリクスを CloudWatch へ PUT ──────────────
    const metricsLambda = new NodejsFunction(this, "MetricsPublisher", {
      functionName: createResourceName("metrics-publisher", stage),
      runtime: Runtime.NODEJS_22_X,
      entry: path.join(
        __dirname,
        "../../src/lambda/metricsPublisher/handler.ts",
      ),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      environment: {
        METRICS_NAMESPACE: this.metricsNamespace,
        ENVIRONMENT: stage,
      },
      logRetention: logs.RetentionDays.ONE_MONTH,
    });

    // CloudWatch へのカスタムメトリクス書き込み権限
    metricsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
        conditions: {
          StringEquals: { "cloudwatch:namespace": this.metricsNamespace },
        },
      }),
    );

    // ── IoT Rule: 全デバイスのメトリクスメッセージを受信 ───────────
    // デバイスは  iot/{stage}/devices/+/metrics  トピックに publish する想定
    // ペイロード例: { "deviceId": "d-001", "temp": 23.5 }
    const iotRuleRole = new iam.Role(this, "IoTRuleRole", {
      assumedBy: new iam.ServicePrincipal("iot.amazonaws.com"),
    });
    metricsLambda.grantInvoke(iotRuleRole);

    new iot.CfnTopicRule(this, "MetricsRule", {
      ruleName: createResourceName("device-metrics", stage, true),
      topicRulePayload: {
        description: "IoT デバイスメトリクスを Lambda へ転送",
        sql: `SELECT *, topic(4) as deviceId FROM 'iot/${stage}/devices/+/metrics'`,
        awsIotSqlVersion: "2016-03-23",
        actions: [
          {
            lambda: { functionArn: metricsLambda.functionArn },
          },
        ],
        // エラーアクション: CloudWatch Logs へ記録
        errorAction: {
          cloudwatchLogs: {
            logGroupName: `/aws/iot/rule-errors/${stage}`,
            roleArn: iotRuleRole.roleArn,
          },
        },
      },
    });

    // IoT から Lambda を呼び出す許可
    metricsLambda.addPermission("IoTInvoke", {
      principal: new iam.ServicePrincipal("iot.amazonaws.com"),
    });
  }
}

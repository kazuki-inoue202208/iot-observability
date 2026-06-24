import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import { Construct } from "constructs";
import { createResourceName } from "../../util/resource";
import { IoTMetrics } from "./iot-metrics-construct";

export interface IoTDashboardConstructProps {
  stage: string;
  /** IoTMetricsConstruct で定義した共有メトリクスオブジェクト */
  metrics: IoTMetrics;
  /** アラームステータスウィジェットに表示するアラーム一覧 */
  alarms: cloudwatch.IAlarm[];
  /** エッジサーバー接続状態メトリクス（IoTEdgeServerMonitorConstruct から渡す） */
  edgeServerConnectedMetric: cloudwatch.MathExpression;
}

/**
 * IoTDashboardConstruct
 *
 * CloudWatch ダッシュボードを CDK で完全定義する。
 *
 * ウィジェット構成:
 *  Row 1: タイトル
 *  Row 2: アラームステータス一覧
 *  Row 3: エッジサーバー接続状態
 *  Row 4: 接続エラー率 (12) | 温度センサー (12)
 *  Row 5: メッセージ受信数 (12)
 *  Row 6: 数値サマリー（アクティブデバイス / 平均温度 / メッセージ数）
 */
export class IoTDashboardConstruct extends Construct {
  constructor(scope: Construct, id: string, props: IoTDashboardConstructProps) {
    super(scope, id);

    const { stage, metrics, alarms, edgeServerConnectedMetric } = props;

    const dashboard = new cloudwatch.Dashboard(this, "IoTDashboard", {
      dashboardName: createResourceName("dashboard", stage),
      defaultInterval: cdk.Duration.hours(3),
    });

    // ── Row 1: タイトル ─────────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: [
          `# 🌐 IoT デバイス監視ダッシュボード`,
          `**環境:** ${stage}`,
          `> このダッシュボードは AWS CDK によって自動生成されています。`,
        ].join("\n"),
        width: 24,
        height: 2,
      }),
    );

    // ── Row 2: アラームステータス ───────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.AlarmStatusWidget({
        title: "🚨 アラームステータス一覧",
        alarms,
        width: 24,
        height: 4,
      }),
    );

    // ── Row 3: エッジサーバー接続状態 ──────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "🖥️ エッジサーバー接続状態",
        width: 24,
        height: 4,
        left: [edgeServerConnectedMetric],
        leftYAxis: { min: 0, max: 1 },
        leftAnnotations: [
          { value: 1, label: "接続中", color: cloudwatch.Color.GREEN },
          { value: 0, label: "切断", color: cloudwatch.Color.RED },
        ],
      }),
    );

    // ── Row 4: 温度センサー ─────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "🌡️ デバイス温度 (°C) — デバイス別",
        width: 24,
        height: 6,
        left: [metrics.deviceTemperatureSearch],
        leftAnnotations: [
          { value: 80, label: "過熱警告 (80°C)", color: cloudwatch.Color.RED },
        ],
      }),
    );

    // ── Row 5: メッセージ受信数 ─────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "📨 メッセージ受信数 (件/分)",
        width: 12,
        height: 6,
        left: [
          metrics.receivedMessageCount.with({
            label: "メッセージ数",
            color: "#9b59b6",
          }),
        ],
        view: cloudwatch.GraphWidgetView.TIME_SERIES,
      }),
    );

    // ── Row 6: 数値サマリー ─────────────────────────────────────────
    dashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: "アクティブデバイス数",
        metrics: [metrics.activeDeviceCount],
        width: 8,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: "最高温度 (°C)",
        metrics: [metrics.deviceTemperatureForAlarm],
        width: 8,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: "直近 1 分のメッセージ数",
        metrics: [metrics.receivedMessageCount],
        width: 8,
        height: 4,
      }),
    );
  }
}

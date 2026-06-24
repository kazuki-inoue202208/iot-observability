import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import { IoTMetricsConstruct } from "./iotObservability/iot-metrics-construct";
import { IoTAlarmsConstruct } from "./iotObservability/iot-alarms-construct";
import { IoTDashboardConstruct } from "./iotObservability/iot-dashboard-construct";
import { IoTEdgeServerMonitorConstruct } from "./iotObservability/iot-edge-server-monitor-construct";
import { IoTSlackNotifierConstruct } from "./iotObservability/iot-slack-notifier-construct";
import { Context } from "../util/type-context";

export interface IotObservabilityStackProps extends cdk.StackProps {
  /** 環境名（prd / stg / dev） */
  context: Context;
  /** 監視対象デバイスが属する IoT Thing Group 名 */
  thingGroupName: string;
}

/**
 * IoT 可観測性スタック
 *
 * 構成要素:
 *  1. IoTMetricsConstruct        - カスタムメトリクス収集 + メトリクスオブジェクト一元管理
 *  2. IoTAlarmsConstruct         - 死活監視・異常検知アラーム
 *  3. IoTEdgeServerMonitorConstruct - エッジサーバー起動/停止監視
 *  4. IoTDashboardConstruct      - CloudWatch ダッシュボード
 *  5. IoTSlackNotifierConstruct  - Slack 通知（SNS → AWS Chatbot）
 */
export class IotObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IotObservabilityStackProps) {
    super(scope, id, props);

    const { context, thingGroupName } = props;
    const { stage, slackWorkspaceId, slackChannelId } = context;

    // ── 1. Slack 通知基盤 ──────────────────────────────────────────
    const slackNotifier = new IoTSlackNotifierConstruct(this, "SlackNotifier", {
      stage,
      slackWorkspaceId,
      slackChannelId,
    });

    // ── 2. カスタムメトリクス収集基盤（メトリクスオブジェクトを一元管理） ──
    const metricsConstruct = new IoTMetricsConstruct(this, "IoTMetrics", {
      stage,
    });

    // ── 3. アラーム定義 ────────────────────────────────────────────
    const alarms = new IoTAlarmsConstruct(this, "IoTAlarms", {
      stage,
      metrics: metricsConstruct.metrics,
      alarmTopic: slackNotifier.alarmTopic,
    });

    // ── 4. エッジサーバー起動監視 ──────────────────────────────────
    const edgeServerMonitor = new IoTEdgeServerMonitorConstruct(
      this,
      "EdgeServerMonitor",
      {
        stage,
        thingGroupName,
        metricsNamespace: metricsConstruct.metricsNamespace,
      },
    );

    // ── 5. ダッシュボード ──────────────────────────────────────────
    new IoTDashboardConstruct(this, "IoTDashboard", {
      stage,
      metrics: metricsConstruct.metrics,
      alarms: alarms.alarmList,
      edgeServerConnectedMetric: edgeServerMonitor.connectedMetric,
    });
  }
}

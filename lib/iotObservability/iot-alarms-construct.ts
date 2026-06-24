import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import { createResourceName } from "../../util/resource";
import { IoTMetrics } from "./iot-metrics-construct";

export interface IoTAlarmsConstructProps {
  stage: string;
  metricsTopic?: sns.Topic;
  alarmTopic?: sns.Topic;
  /** IoTMetricsConstruct で定義した共有メトリクスオブジェクト */
  metrics: IoTMetrics;
}

/**
 * IoTAlarmsConstruct
 *
 * デバイスの死活監視・閾値アラームを定義する。
 *
 * 定義するアラーム:
 *  1. HighTemperature         – 温度センサー値が上限超過
 */
export class IoTAlarmsConstruct extends Construct {
  /** 外部から参照できるアラームの一覧（ダッシュボード等で利用） */
  public readonly alarmList: cloudwatch.IAlarm[];

  constructor(scope: Construct, id: string, props: IoTAlarmsConstructProps) {
    super(scope, id);

    const { stage, metrics, alarmTopic } = props;
    const alarmAction = alarmTopic
      ? new cw_actions.SnsAction(alarmTopic)
      : undefined;
    this.alarmList = [];
    const addAction = (alarm: cloudwatch.Alarm, addOk = false) => {
      if (!alarmAction) return;
      alarm.addAlarmAction(alarmAction);
      if (addOk) alarm.addOkAction(alarmAction);
    };

    // ── 1. 高温アラーム ─────────────────────────────────────────────
    const highTempAlarm = new cloudwatch.Alarm(this, "HighTemperatureAlarm", {
      alarmName: createResourceName("high-temperature-alarm", stage),
      alarmDescription:
        "温度センサーが 40°C を超えました（デバイス過熱の可能性）",
      metric: metrics.deviceTemperatureForAlarm,
      threshold: 40,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    addAction(highTempAlarm);
    this.alarmList.push(highTempAlarm);

    // ── Composite Alarm（重大アラーム統合） ─────────────────────────
    // 高温 が発生 = 重大インシデント
    const criticalAlarm = new cloudwatch.CompositeAlarm(
      this,
      "CriticalCompositeAlarm",
      {
        compositeAlarmName: createResourceName("critical-alarm", stage),
        alarmDescription: "重大アラーム: 高温アラームが発生しました",
        alarmRule: cloudwatch.AlarmRule.anyOf(
          cloudwatch.AlarmRule.fromAlarm(
            highTempAlarm,
            cloudwatch.AlarmState.ALARM,
          ),
        ),
        actionsEnabled: true,
      },
    );
    if (alarmAction) criticalAlarm.addAlarmAction(alarmAction);
    this.alarmList.push(criticalAlarm);
  }
}

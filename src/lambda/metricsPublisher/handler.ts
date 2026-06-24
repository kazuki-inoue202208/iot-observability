// IoT Core から受け取ったデバイスメッセージを
// CloudWatch カスタムメトリクスとして記録する Lambda 関数

import {
  CloudWatchClient,
  PutMetricDataCommand,
  MetricDatum,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";

const cw = new CloudWatchClient({});
const NAMESPACE = process.env.METRICS_NAMESPACE ?? "IoT/production";
const ENV = process.env.ENVIRONMENT ?? "production";

interface DevicePayload {
  deviceId: string;
  timestamp?: number;
  temperature?: number; // °C
}

/**
 * メトリクスデータを CloudWatch へ送信するヘルパー
 */
async function putMetrics(data: MetricDatum[]): Promise<void> {
  // CloudWatch は 1 リクエストで最大 1000 件まで
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    await cw.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: data.slice(i, i + CHUNK_SIZE),
      }),
    );
  }
}

/**
 * デバイスペイロードから CloudWatch MetricDatum を組み立てる
 */
function buildMetrics(payload: DevicePayload): MetricDatum[] {
  const envDimension = [{ Name: "Environment", Value: ENV }];
  const timestamp = payload.timestamp
    ? new Date(payload.timestamp * 1000)
    : new Date();

  const metrics: MetricDatum[] = [];

  // 報告があった = アクティブ（1 としてカウント）
  metrics.push({
    MetricName: "ActiveDeviceCount",
    Dimensions: envDimension,
    Value: 1,
    Unit: StandardUnit.Count,
    Timestamp: timestamp,
  });

  if (payload.temperature !== undefined) {
    // [Environment, DeviceId]: ダッシュボードのデバイス別グラフ用 (SEARCH で取得)
    metrics.push({
      MetricName: "DeviceTemperature",
      Dimensions: [
        { Name: "Environment", Value: ENV },
        { Name: "DeviceId", Value: payload.deviceId },
      ],
      Value: payload.temperature,
      Unit: StandardUnit.None,
      Timestamp: timestamp,
    });
    // [Environment] のみ: 標準 Metric Alarm 用。複数デバイスのデータを Maximum で集計し過熱検知に使う
    metrics.push({
      MetricName: "DeviceTemperature",
      Dimensions: [{ Name: "Environment", Value: ENV }],
      Value: payload.temperature,
      Unit: StandardUnit.None,
      Timestamp: timestamp,
    });
  }

  metrics.push({
    MetricName: "ReceivedMessageCount",
    Dimensions: envDimension,
    Value: 1,
    Unit: StandardUnit.Count,
    Timestamp: timestamp,
  });

  return metrics;
}

// ── Lambda ハンドラー ──────────────────────────────────────────────
export const handler = async (
  event: DevicePayload | DevicePayload[],
): Promise<void> => {
  const payloads = Array.isArray(event) ? event : [event];

  console.log(`Processing ${payloads.length} device message(s)`);

  const allMetrics: MetricDatum[] = [];
  for (const payload of payloads) {
    if (!payload.deviceId) {
      console.warn(
        "deviceId が含まれていないペイロードをスキップします",
        payload,
      );
      continue;
    }
    allMetrics.push(...buildMetrics(payload));
  }

  if (allMetrics.length === 0) {
    console.log("送信するメトリクスがありません");
    return;
  }

  try {
    await putMetrics(allMetrics);
    console.log(
      `CloudWatch へ ${allMetrics.length} 件のメトリクスを送信しました`,
    );
  } catch (error) {
    console.error("CloudWatch へのメトリクス送信に失敗しました", error);
    throw error; // IoT Rule のエラーアクションをトリガーするため再スロー
  }
};

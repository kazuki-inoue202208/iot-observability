// Greengrass Lambda ハンドラー
// IoT Core から MQTT メッセージを受信し、監視用メトリクスを
// iot/{stage}/devices/{deviceId}/metrics トピックへ再 publish する

import * as ggSdk from "aws-greengrass-core-sdk";

const iotData = new ggSdk.IotData();

const STAGE = process.env.NODE_ENV ?? "dev";
const METRICS_TOPIC_PREFIX = `iot/${STAGE}/devices`;

// サブスクライブするトピックの種別
// iot/{stage}/devices/{deviceId}/{MetricType} の末尾セグメントに対応
type MetricType = "temperature";

// 各トピックの受信ペイロード定義
interface TemperaturePayload {
  temperature: number; // °C
}

type IncomingPayload = TemperaturePayload;

// metricsPublisher/handler.ts が受け取るフォーマット
interface MetricsPayload {
  deviceId: string;
  timestamp: number;
  temperature?: number;
}

// Greengrass Lambda のコンテキスト型（型定義が公式に提供されないため独自定義）
interface GreengrassContext {
  clientContext?: {
    Custom?: {
      subject?: string; // 受信したMQTTトピック
    };
  };
}

/**
 * トピック "iot/{stage}/devices/{deviceId}/{metricType}" から deviceId と metricType を取得する
 * 例: "iot/dev/devices/device-001/temperature" → { deviceId: "device-001", metricType: "temperature" }
 */
function parseTopic(topic: string): {
  deviceId: string;
  metricType: MetricType;
} | null {
  const parts = topic.split("/");
  // 期待形式: ["iot", "{stage}", "devices", "{deviceId}", "{metricType}"]
  if (parts.length !== 5 || parts[0] !== "iot" || parts[2] !== "devices") {
    return null;
  }
  const deviceId = parts[3];
  const metricType = parts[4] as MetricType;
  const validTypes: MetricType[] = ["temperature"];
  if (!deviceId || !validTypes.includes(metricType)) return null;
  return { deviceId, metricType };
}

/**
 * metricType ごとにペイロードから必要なフィールドだけを取り出す
 */
function buildMetricsPayload(
  deviceId: string,
  event: IncomingPayload,
): MetricsPayload {
  const base: MetricsPayload = {
    deviceId,
    timestamp: Math.floor(Date.now() / 1000),
  };

  const e = event as unknown as Record<string, unknown>;

  return { ...base, temperature: e["temperature"] as number };
}

export const handler = (
  event: IncomingPayload,
  context: GreengrassContext,
  callback: (err: Error | null) => void,
): void => {
  const topic = context.clientContext?.Custom?.subject ?? "";

  console.log(`受信トピック: ${topic}, ペイロード: ${JSON.stringify(event)}`);

  const parsed = parseTopic(topic);
  if (!parsed) {
    console.warn("想定外のトピック形式をスキップします:", topic);
    callback(null);
    return;
  }

  const { deviceId, metricType } = parsed;
  const metricsPayload = buildMetricsPayload(deviceId, event);
  const metricsTopic = `${METRICS_TOPIC_PREFIX}/${deviceId}/metrics`;

  iotData.publish(
    {
      topic: metricsTopic,
      payload: JSON.stringify(metricsPayload),
    },
    (err: Error | null) => {
      if (err) {
        console.error(`メトリクス送信失敗 (topic=${metricsTopic}):`, err);
        callback(err);
        return;
      }
      console.log(`メトリクス送信完了 [${metricType}] (topic=${metricsTopic})`);
      callback(null);
    },
  );
};

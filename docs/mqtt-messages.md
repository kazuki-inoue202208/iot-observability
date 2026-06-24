# MQTT メッセージ仕様書

IoT デバイスから送信される MQTT メッセージのフォーマットと、CloudWatch アラームとの対応をまとめます。

---

## メッセージフロー概要

```
IoT デバイス
  │
  │ MQTT Publish
  ▼
IoT Core（各センサートピック）
  │
  │ Greengrass LegacySubscriptionRouter でルーティング
  ▼
Greengrass Lambda（iot.ts）
  │
  │ MQTT Publish → iot/{stage}/devices/{deviceId}/metrics
  ▼
IoT Core（メトリクストピック）
  │
  │ IoT Topic Rule
  ▼
Lambda（metricsPublisher/handler.ts）
  │
  │ PutMetricData
  ▼
CloudWatch カスタムメトリクス
  │
  └─ HighTemperature アラーム
```

---

## 1. 温度センサーデータ（→ HighTemperature アラーム）

### 受信トピック

```
iot/{stage}/devices/{deviceId}/temperature
```

### ペイロード

```json
{
  "temperature": 25.3
}
```

| フィールド | 型 | 単位 | 説明 |
|---|---|---|---|
| `temperature` | number | °C | デバイスの温度センサー値 |

### 例（正常範囲）

```json
{
  "temperature": 25.3
}
```

### 例（アラーム閾値超過：80°C 超）

```json
{
  "temperature": 83.5
}
```

### 対応する CloudWatch メトリクス

| メトリクス名 | 値 | 統計 | アラーム閾値 |
|---|---|---|---|
| `DeviceTemperature` | `temperature` の値 | Maximum | > 80°C でアラーム |

---

## 2. メトリクス集約メッセージ（iot.ts が送信）

上記トピックを受信した `iot.ts` が、内部で以下のトピックへ集約して再 publish します。

### 送信トピック

```
iot/{stage}/devices/{deviceId}/metrics
```

### ペイロード例（温度データ受信後）

```json
{
  "deviceId": "device-001",
  "timestamp": 1749869400,
  "temperature": 25.3
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `deviceId` | string | デバイス識別子（トピックから自動抽出） |
| `timestamp` | number | Unix タイムスタンプ（秒） |
| `temperature` | number | 温度センサー値（°C） |

---

## 3. エッジサーバーライフサイクルイベント（→ EdgeServer アラーム）

エッジサーバー自体の接続/切断は IoT Core のライフサイクルイベント経由で監視します（デバイス→Greengrassの別経路）。

### 接続イベントトピック（IoT Core が自動送信）

```
$aws/events/presence/connected/{edgeServerId}
```

### ペイロード例

```json
{
  "clientId": "edge-server-001",
  "timestamp": 1749869400000,
  "eventType": "connected",
  "sessionIdentifier": "a1b2c3d4-...",
  "principalIdentifier": "arn:aws:iot:ap-northeast-1:..."
}
```

### 切断イベントトピック（IoT Core が自動送信）

```
$aws/events/presence/disconnected/{edgeServerId}
```

### ペイロード例

```json
{
  "clientId": "edge-server-001",
  "timestamp": 1749869400000,
  "eventType": "disconnected",
  "disconnectReason": "MQTT_KEEP_ALIVE_TIMEOUT",
  "sessionIdentifier": "a1b2c3d4-...",
  "principalIdentifier": "arn:aws:iot:ap-northeast-1:..."
}
```

### 対応する CloudWatch メトリクス

| メトリクス名 | 値 | 説明 |
|---|---|---|
| `EdgeServerConnected` | 1（接続時）/ 0（切断時） | エッジサーバーの死活状態 |

---

## アラーム一覧

| アラーム名 | 対象トピック | 閾値 | 評価条件 |
|---|---|---|---|
| `IoT-HighTemperature-{stage}` | `.../temperature` | 80°C 超 | 1期間 |
| `IoT-EdgeServer-{stage}` | ライフサイクルイベント | 5分間オフライン | 1期間 |

import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { IoTClient, ListThingsInThingGroupCommand } from "@aws-sdk/client-iot";

const cw = new CloudWatchClient({});
const iot = new IoTClient({});
const NAMESPACE = process.env.METRICS_NAMESPACE ?? "IoT/production";
const ENV = process.env.ENVIRONMENT ?? "production";
const THING_GROUP_NAME = process.env.THING_GROUP_NAME ?? "";

interface LifecycleEvent {
  clientId: string;
  eventType: "connected" | "disconnected";
  timestamp: number;
  sessionIdentifier?: string;
  principalIdentifier?: string;
  disconnectReason?: string;
}

async function isInThingGroup(clientId: string): Promise<boolean> {
  const result = await iot.send(
    new ListThingsInThingGroupCommand({ thingGroupName: THING_GROUP_NAME }),
  );
  return result.things?.includes(clientId) ?? false;
}

export const handler = async (event: LifecycleEvent): Promise<void> => {
  const { clientId, eventType } = event;

  console.log(`Lifecycle event: clientId=${clientId}, eventType=${eventType}`);

  const inGroup = await isInThingGroup(clientId);
  if (!inGroup) {
    console.log(`${clientId} はグループ ${THING_GROUP_NAME} 外のためスキップ`);
    return;
  }

  const value = eventType === "connected" ? 1 : 0;

  await cw.send(
    new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [
        {
          MetricName: "EdgeServerConnected",
          Dimensions: [
            { Name: "Environment", Value: ENV },
            { Name: "DeviceId", Value: clientId },
          ],
          Value: value,
          Unit: "Count",
          Timestamp: new Date(),
        },
      ],
    }),
  );

  console.log(
    `EdgeServerConnected メトリクスを ${value} として記録しました (clientId=${clientId})`,
  );
};

import { aws_iot as iot } from "aws-cdk-lib";

import { Construct } from "constructs";
import { createResourceName } from "../../util/resource";

export interface IotProps {
  stage: string;
  stageSuffix: string;
}

export class Iot extends Construct {
  public readonly thingGroup: iot.CfnThingGroup;
  public readonly thingGroupName: string;

  constructor(scope: Construct, id: string, props: IotProps) {
    super(scope, id);

    const { stage, stageSuffix } = props;

    // ── Greengrass エッジサーバー用 Thing Group ────────────────────
    const thingGroupName = createResourceName("group", stage);
    const thingGroup = new iot.CfnThingGroup(
      this,
      "EdgeServerGroup" + stageSuffix,
      {
        thingGroupName: thingGroupName,
      },
    );
    this.thingGroup = thingGroup;
    this.thingGroupName = thingGroupName;

    // // ── センサーデバイス用 IoT Policy ──────────────────────────────
    // デバイスからの接続/メッセージ送信を許可する IoT Policy を作成する。
    // const policyName = createResourceName("sensor-device-policy", stage);
    // const sensorPolicy = new iot.CfnPolicy(this, "DevicePolicy" + stageSuffix, {
    //   policyName: policyName,
    //   policyDocument: {
    //     Version: "2012-10-17",
    //     Statement: [
    //       {
    //         // 自身の Thing 名と同じ clientId でのみ接続を許可
    //         Sid: "AllowConnect",
    //         Effect: "Allow",
    //         Action: "iot:Connect",
    //         Resource: `arn:aws:iot:*:*:client/\${iot:Connection.Thing.ThingName}`,
    //       },
    //       {
    //         // 自身の Thing 名配下のセンサートピックへのみ publish を許可
    //         Sid: "AllowPublishSensorMetrics",
    //         Effect: "Allow",
    //         Action: "iot:Publish",
    //         Resource: [
    //           `arn:aws:iot:*:*:topic/iot/devices/\${iot:Connection.Thing.ThingName}/temperature`,
    //           `arn:aws:iot:*:*:topic/iot/devices/\${iot:Connection.Thing.ThingName}/battery`,
    //           `arn:aws:iot:*:*:topic/iot/devices/\${iot:Connection.Thing.ThingName}/connection`,
    //           `arn:aws:iot:*:*:topic/iot/devices/\${iot:Connection.Thing.ThingName}/latency`,
    //         ],
    //       },
    //     ],
    //   },
    // });

    // // ── Thing Group へポリシーをアタッチ ───────────────────────────
    // // CfnPolicyPrincipalAttachment は証明書のみ対応のため AwsCustomResource を使用
    // const attachment = new AwsCustomResource(
    //   this,
    //   "AttachPolicyToThingGroup" + stageSuffix,
    //   {
    //     onCreate: {
    //       service: "Iot",
    //       action: "attachPolicy",
    //       parameters: {
    //         policyName: policyName,
    //         target: thingGroup.attrArn,
    //       },
    //       physicalResourceId: PhysicalResourceId.of(
    //         `ThingGroupPolicyAttachment-${stage}`,
    //       ),
    //     },
    //     onDelete: {
    //       service: "Iot",
    //       action: "detachPolicy",
    //       parameters: {
    //         policyName: policyName,
    //         target: thingGroup.attrArn,
    //       },
    //       physicalResourceId: PhysicalResourceId.of(
    //         `ThingGroupPolicyAttachment-${stage}`,
    //       ),
    //     },
    //     policy: AwsCustomResourcePolicy.fromSdkCalls({
    //       resources: AwsCustomResourcePolicy.ANY_RESOURCE,
    //     }),
    //   },
    // );

    // attachment.node.addDependency(sensorPolicy);
    // attachment.node.addDependency(thingGroup);
  }
}

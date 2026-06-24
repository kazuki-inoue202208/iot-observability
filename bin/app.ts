#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { IotObservabilityStack } from "../lib/iot-observability-stack";
import { getConfig } from "../util/get-config";
import { appTag } from "../util/resource";
import { GreengrassStack } from "../lib/greengrass-stack";

// AWSリソース名の接頭辞
export const PROJECT_NAME = "iot-observability";

const app = new cdk.App();
const context = getConfig(app);
appTag(app, context.stageSuffix);

// Iot のモノのグループや Greengrass コンポーネントを作成
const greengrassStack = new GreengrassStack(
  app,
  "GreengrassStack" + context.stageSuffix,
  {
    context,
    region: "ap-northeast-1",
  },
);

// IoT 可観測性スタックの作成
new IotObservabilityStack(app, "IotObservabilityStack" + context.stageSuffix, {
  context,
  // 監視対象デバイスが属する IoT Thing Group 名
  thingGroupName: greengrassStack.thingGroupName,
});

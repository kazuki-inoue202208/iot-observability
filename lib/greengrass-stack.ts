import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import type { Context } from "../util/type-context";
import { Component } from "./greengrass/component";
import { Deploy } from "./greengrass/deploy";
import { Iot } from "./greengrass/iot";
import { aws_iot as iot } from "aws-cdk-lib";

interface GreengrassStackProps extends cdk.StackProps {
  context: Context;
  region: string;
}

export class GreengrassStack extends cdk.Stack {
  public readonly thingGroup: iot.CfnThingGroup;
  public readonly thingGroupName: string;

  constructor(scope: Construct, id: string, props: GreengrassStackProps) {
    super(scope, id, props);

    const { region, context } = props;

    // iot thing group
    const iot = new Iot(this, "Iot" + context.stageSuffix, {
      stage: context.stage,
      stageSuffix: context.stageSuffix,
    });

    // greengrass component
    const component = new Component(this, "Component" + context.stageSuffix, {
      context,
      region,
    });

    // greengrass deployment
    new Deploy(this, "Deploy" + context.stageSuffix, {
      context,
      targetThingGroup: iot.thingGroup,
      iotLambdaComponent: component.iotLambdaComponent,
    });

    this.thingGroup = iot.thingGroup;
    this.thingGroupName = iot.thingGroupName;
  }
}

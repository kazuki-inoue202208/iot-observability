import {
  aws_greengrassv2 as greengrass,
  aws_iot as iot,
  CustomResource,
} from "aws-cdk-lib";
import { Context } from "../../util/type-context";

export interface ComponentProps {
  context: Context;
  region: string;
}

export interface GreengrassComponentInfo {
  name: string;
  component: greengrass.CfnComponentVersion | CustomResource;
  version?: string;
  imageName?: string;
}

export interface DeployProps {
  context: Context;
  targetThingGroup: iot.CfnThingGroup;
  iotLambdaComponent: GreengrassComponentInfo;
}

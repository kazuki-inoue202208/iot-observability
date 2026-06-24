import * as cdk from "aws-cdk-lib";
import * as greengrassv2 from "aws-cdk-lib/aws-greengrassv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { createResourceName } from "../../util/resource";
import { Context } from "../../util/type-context";
import { CustomResource } from "aws-cdk-lib";

export interface ComponentProps {
  context: Context;
  region: string;
}

export interface GreengrassComponentInfo {
  name: string;
  component: cdk.aws_greengrassv2.CfnComponentVersion | CustomResource;
  version?: string;
  imageName?: string;
}

export class Component extends Construct {
  public readonly iotLambdaComponent: GreengrassComponentInfo;

  constructor(scope: Construct, id: string, props: ComponentProps) {
    super(scope, id);

    const { context } = props;
    const { stage, stageSuffix } = context;
    // ------------------------------------------------------------
    // Lambda Component (IoT Data)

    // Greengrass用のLambda実行ロール
    const lambdaRoleName = createResourceName("greengrass-lambda-role", stage);
    const lambdaRole = new iam.Role(
      this,
      "GreengrassLambdaRole" + stageSuffix,
      {
        roleName: lambdaRoleName,
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole",
          ),
          iam.ManagedPolicy.fromAwsManagedPolicyName("AWSIoTDataAccess"),
        ],
        inlinePolicies: {
          IoTPolicy: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                actions: [
                  "logs:CreateLogGroup",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents",
                ],
                resources: ["*"],
              }),
            ],
          }),
        },
      },
    );

    // Lambda関数の作成
    const iotLambdaFunctionName = createResourceName("iot-lambda", stage);
    const iotLambdaFunction = new NodejsFunction(
      this,
      "IoTLambdaFunction" + stageSuffix,
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: "src/lambda/iot/handler.ts",
        handler: "handler",
        role: lambdaRole,
        functionName: iotLambdaFunctionName,
        timeout: cdk.Duration.seconds(6),
        memorySize: 1024,
        environment: {},
        bundling: {
          // バンドルに含める（npmでインストール可能）
          nodeModules: ["aws-greengrass-core-sdk"],
          // バンドルから除外（Greengrassランタイムが提供）
          externalModules: [
            "aws-greengrass-common-js",
            "aws-greengrass-ipc-sdk-js",
          ],
        },
      },
    );

    // Lambda Component の作成
    const iotLambdaComponentName = createResourceName(
      "iot-lambda-component",
      stage,
    );
    const iotLambdaComponent = new greengrassv2.CfnComponentVersion(
      this,
      "IoTLambdaComponent" + stageSuffix,
      {
        lambdaFunction: {
          lambdaArn: iotLambdaFunction.currentVersion.functionArn,
          componentName: iotLambdaComponentName,
          componentLambdaParameters: {
            environmentVariables: {
              NODE_ENV: stage,
            },
            eventSources: [
              // 温度センサーデータ → HighTemperature アラーム
              {
                topic: `iot/${stage}/devices/+/temperature`,
                type: "IOT_CORE",
              },
            ],
            timeoutInSeconds: 10,
            maxInstancesCount: 100,
            inputPayloadEncodingType: "json",
            maxQueueSize: 1000,
            pinned: true,
            maxIdleTimeInSeconds: 300,
            statusTimeoutInSeconds: 300,
            linuxProcessParams: {
              isolationMode: "NoContainer",
            },
          },
        },
      },
    );

    this.iotLambdaComponent = {
      name: iotLambdaComponentName,
      component: iotLambdaComponent,
    };
  }
}

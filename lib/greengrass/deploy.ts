import { aws_greengrassv2 as greengrass, CustomResource } from "aws-cdk-lib";
import * as greengrassv2 from "aws-cdk-lib/aws-greengrassv2";
import { Construct } from "constructs";
import { createResourceName } from "../../util/resource";
import { DeployProps } from "../type/greengrass";

/**
 * コンポーネント情報からコンポーネントバージョンを取得
 * CfnComponentVersion と CustomResource の両方に対応
 */
function getComponentVersion(
  component: greengrass.CfnComponentVersion | CustomResource,
): string {
  if (component instanceof greengrass.CfnComponentVersion) {
    return component.attrComponentVersion;
  }
  // CustomResource の場合は、カスタムリソースの返却値から
  // 実際の componentVersion を取得する
  return component.getAttString("componentVersion");
}

export class Deploy extends Construct {
  constructor(scope: Construct, id: string, props: DeployProps) {
    super(scope, id);
    const { context, targetThingGroup, iotLambdaComponent } = props;

    const deployComponents = {
      [iotLambdaComponent.name]: {
        componentVersion: getComponentVersion(iotLambdaComponent.component),
        configurationUpdate: {
          reset: [""],
        },
      },
      "aws.greengrass.Cli": {
        componentVersion: "2.15.0",
      },
      "aws.greengrass.LegacySubscriptionRouter": {
        componentVersion: "2.1.14",
        configurationUpdate: {
          reset: ["/subscriptions"],
          merge: JSON.stringify({
            subscriptions: {
              [`${iotLambdaComponent.name}-publish-start-job`]: {
                id: `${iotLambdaComponent.name}-publish-start-job`,
                source: `component:${iotLambdaComponent.name}`,
                subject: `iot/${context.stage}/devices/+/metrics`,
                target: "cloud",
              },
            },
          }),
        },
      },
      "aws.greengrass.LogManager": {
        componentVersion: "2.3.10",
        configurationUpdate: {
          reset: ["/logsUploaderConfiguration/componentLogsConfigurationMap"],
          merge: JSON.stringify({
            periodicUploadIntervalSec: 60,
            logsUploaderConfiguration: {
              systemLogsConfiguration: {
                uploadToCloudWatch: true,
                minimumLogLevel: "INFO",
              },
              componentLogsConfigurationMap: {
                [iotLambdaComponent.name]: {
                  uploadToCloudWatch: true,
                  minimumLogLevel: "INFO",
                },
              },
            },
          }),
        },
      },
      "aws.greengrass.Nucleus": {
        componentVersion: "2.15.0",
      },
    };

    // Greengrass デプロイメント
    const deployName = createResourceName(
      "greengrass-deployment",
      context.stage,
    );
    new greengrassv2.CfnDeployment(
      this,
      "ComponentDeployment" + context.stageSuffix,
      {
        targetArn: targetThingGroup.attrArn,
        deploymentName: deployName,
        components: deployComponents,
        deploymentPolicies: {
          failureHandlingPolicy: "ROLLBACK",
          componentUpdatePolicy: {
            timeoutInSeconds: 900,
            action: "NOTIFY_COMPONENTS",
          },
        },
      },
    );
  }
}

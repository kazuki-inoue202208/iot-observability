import * as chatbot from "aws-cdk-lib/aws-chatbot";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";
import { createResourceName } from "../../util/resource";

export interface IoTSlackNotifierConstructProps {
  stage: string;
  /** AWS Chatbot で認可済みの Slack ワークスペース ID */
  slackWorkspaceId: string;
  /** 通知を送る Slack チャンネル ID */
  slackChannelId: string;
}

/**
 * IoTSlackNotifierConstruct
 *
 * CloudWatch アラーム → SNS → AWS Chatbot → Slack の通知フローを構築する。
 *
 * 事前に AWS コンソールで Slack ワークスペースの認可が必要。
 *   AWS Chatbot > Configured clients > Slack > ワークスペースを追加
 */
export class IoTSlackNotifierConstruct extends Construct {
  /** アラームアクションに追加する SNS Topic */
  public readonly alarmTopic: sns.Topic;

  constructor(
    scope: Construct,
    id: string,
    props: IoTSlackNotifierConstructProps,
  ) {
    super(scope, id);

    const { stage, slackWorkspaceId, slackChannelId } = props;

    // ── SNS Topic ─────────────────────────────────────────────────
    this.alarmTopic = new sns.Topic(this, "AlarmTopic", {
      topicName: createResourceName("alarm-notifications", stage),
      displayName: `IoT アラーム通知 – ${stage}`,
    });

    // ── AWS Chatbot: SNS → Slack ───────────────────────────────────
    new chatbot.SlackChannelConfiguration(this, "SlackChannel", {
      slackChannelConfigurationName: createResourceName("alerts", stage),
      slackWorkspaceId,
      slackChannelId,
      notificationTopics: [this.alarmTopic],
      loggingLevel: chatbot.LoggingLevel.ERROR,
      role: new iam.Role(this, "ChatbotRole", {
        assumedBy: new iam.ServicePrincipal("chatbot.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess"),
        ],
      }),
    });
  }
}

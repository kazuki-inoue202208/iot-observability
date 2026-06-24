import { Context } from "./type-context";
import type * as cdk from "aws-cdk-lib";

export const toCompanyStackSuffix = (companyCode: string): string => {
  const parts = companyCode.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) {
    return "Default";
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
};

// 環境変数を取得する関数
export const getConfig = <T extends cdk.App | cdk.Stack>(app: T): Context => {
  const target = app.node.tryGetContext("stage");

  const contextStage: Context = app.node.tryGetContext(target);
  if (contextStage === undefined) {
    throw new Error(
      "Stage variable missing on CDK command. Pass in a `--context stage=XXX`",
    );
  }
  contextStage.stageSuffix = contextStage.stage.toUpperCase();

  return contextStage;
};

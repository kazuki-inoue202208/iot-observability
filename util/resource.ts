import * as cdk from "aws-cdk-lib";
import { PROJECT_NAME } from "../bin/app";

// AWSリソースのタグのキー
export enum resourceTagKey {
  Stage = "Stage",
  Project = "Project",
  Billing = "Billing",
}

// AWSリソースのシステムタグの値
export enum resourceTagValue {
  project = `${PROJECT_NAME}-construction-management`,
  billing = `${PROJECT_NAME}-construction-management`,
}

// AWSのリソースに共通したタグを付与する関数
export const appTag = (app: cdk.App, environment: string): void => {
  if (
    !(
      environment[0] === environment[0].toUpperCase() &&
      environment[0] !== environment[0].toLowerCase()
    )
  ) {
    environment =
      environment[0].toUpperCase() + environment.slice(1).toLowerCase();
  }
  cdk.Tags.of(app).add(resourceTagKey.Stage, environment);
  cdk.Tags.of(app).add(resourceTagKey.Project, resourceTagValue.project);
  cdk.Tags.of(app).add(resourceTagKey.Billing, resourceTagValue.billing);
};

// リソースの名前を作成する関数
export const createResourceName = (
  resourceName: string,
  stage: string, // 小文字のステージ名
  underScore: boolean = false, // アンダースコアを使用するかどうか
): string => {
  if (
    !(
      stage[0] === stage[0].toLowerCase() && stage[0] !== stage[0].toUpperCase()
    )
  ) {
    stage = stage[0].toLowerCase() + stage.slice(1).toLowerCase();
  }
  if (underScore) {
    // IoT Rule 名など英数字とアンダースコアのみ許可するリソース向け
    // ハイフンをすべてアンダースコアに置換する
    return `${PROJECT_NAME}_${resourceName}_${stage}`.replace(/-/g, "_");
  }
  return `${PROJECT_NAME}-${resourceName}-${stage}`;
};

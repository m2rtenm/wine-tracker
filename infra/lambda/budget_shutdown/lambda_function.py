import json
import os

import boto3

BUDGET_NAME = os.environ["BUDGET_NAME"]
ACCOUNT_ID = os.environ["ACCOUNT_ID"]
MONTHLY_LIMIT_USD = float(os.environ["MONTHLY_LIMIT_USD"])
TARGET_FUNCTION_ARN = os.environ["TARGET_FUNCTION_ARN"]
TARGET_REGION = os.environ["TARGET_REGION"]
RESTORE_CONCURRENCY = int(os.environ["RESTORE_CONCURRENCY"])

LAMBDA = boto3.client("lambda", region_name=TARGET_REGION)


def handler(event, _context):
    if event.get("source") == "aws.events":
        LAMBDA.put_function_concurrency(
            FunctionName=TARGET_FUNCTION_ARN,
            ReservedConcurrentExecutions=RESTORE_CONCURRENCY,
        )
        return {"action": "restored", "concurrency": RESTORE_CONCURRENCY}

    for record in event.get("Records", []):
        message = json.loads(record["Sns"]["Message"])
        notification = message.get("notification", {})
        if (
            message.get("budgetName") != BUDGET_NAME
            or message.get("accountId") != ACCOUNT_ID
            or notification.get("notificationType") != "ACTUAL"
            or notification.get("thresholdType") != "ABSOLUTE_VALUE"
            or notification.get("comparisonOperator") != "GREATER_THAN"
            or float(message.get("costAmount", 0)) < MONTHLY_LIMIT_USD
        ):
            raise ValueError("Budget notification did not match the configured shutdown threshold.")

        LAMBDA.put_function_concurrency(
            FunctionName=TARGET_FUNCTION_ARN,
            ReservedConcurrentExecutions=0,
        )

    return {"action": "disabled"}

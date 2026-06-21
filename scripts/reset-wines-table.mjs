import process from 'node:process';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'eu-north-1';
const TABLE_NAME = process.env.DDB_TABLE || 'WineTracker';
const CONFIRM = process.env.CONFIRM_RESET === 'YES';

if (!CONFIRM) {
  console.error('Refusing to reset table without CONFIRM_RESET=YES');
  process.exit(1);
}

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const scanKeys = async () => {
  const keys = [];
  let exclusiveStartKey;

  do {
    const response = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: 'wineId',
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    for (const item of response.Items || []) {
      if (item.wineId) keys.push({ wineId: item.wineId });
    }

    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return keys;
};

const main = async () => {
  const keys = await scanKeys();
  if (keys.length === 0) {
    console.log(`Table ${TABLE_NAME} already empty.`);
    return;
  }

  for (const batch of chunk(keys, 25)) {
    await docClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch.map(Key => ({ DeleteRequest: { Key } })),
        },
      })
    );
  }

  console.log(`Deleted ${keys.length} items from ${TABLE_NAME}.`);
};

main().catch(error => {
  console.error('Failed to reset table:', error);
  process.exit(1);
});

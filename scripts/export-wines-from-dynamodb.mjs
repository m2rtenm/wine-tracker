import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'eu-north-1';
const TABLE_NAME = process.env.DDB_TABLE || 'WineTracker';
const OUTPUT_PATH = process.env.OUTPUT_PATH || 'public/data/wines.json';

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const sortWines = wines => [...wines].sort((a, b) => (b.wineId || '').localeCompare(a.wineId || ''));

const scanAll = async () => {
  const items = [];
  let exclusiveStartKey;

  do {
    const response = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );

    items.push(...(response.Items || []));
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
};

const main = async () => {
  const wines = sortWines(await scanAll());
  const absOutputPath = path.resolve(OUTPUT_PATH);

  await fs.mkdir(path.dirname(absOutputPath), { recursive: true });
  await fs.writeFile(absOutputPath, JSON.stringify(wines, null, 2), 'utf-8');

  console.log(`Exported ${wines.length} wines to ${absOutputPath}`);
};

main().catch(error => {
  console.error('Failed to export wines from DynamoDB:', error);
  process.exit(1);
});

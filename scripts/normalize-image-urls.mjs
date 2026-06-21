import process from 'node:process';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'eu-north-1';
const TABLE_NAME = process.env.DDB_TABLE || 'WineTracker';
const CF_DOMAIN = process.env.CLOUDFRONT_DOMAIN;

if (!CF_DOMAIN) {
  console.error('Set CLOUDFRONT_DOMAIN, e.g. di42d494exp9n.cloudfront.net');
  process.exit(1);
}

const sourcePrefix = 'https://wine-tracker-media.s3.eu-north-1.amazonaws.com/uploads/';
const targetPrefix = `https://${CF_DOMAIN}/uploads/`;

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const scanAll = async () => {
  const items = [];
  let exclusiveStartKey;

  do {
    const response = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: exclusiveStartKey,
    }));

    items.push(...(response.Items || []));
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
};

const main = async () => {
  const items = await scanAll();

  const updated = items.map(item => {
    const imageUrl = String(item.imageUrl || '').trim();

    if (imageUrl.startsWith(sourcePrefix)) {
      return {
        ...item,
        imageUrl: imageUrl.replace(sourcePrefix, targetPrefix),
      };
    }

    if (/^https?:\/\//i.test(imageUrl)) {
      return item;
    }

    return {
      ...item,
      imageUrl: '',
    };
  });

  for (const batch of chunk(updated, 25)) {
    await docClient.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE_NAME]: batch.map(Item => ({ PutRequest: { Item } })),
      },
    }));
  }

  const converted = updated.filter(item => String(item.imageUrl || '').startsWith(targetPrefix)).length;
  const empty = updated.filter(item => !String(item.imageUrl || '').trim()).length;
  console.log(`Rewrote image URLs to CloudFront: ${converted}`);
  console.log(`Items with empty imageUrl after cleanup: ${empty}`);
};

main().catch(error => {
  console.error('Failed to normalize image URLs:', error);
  process.exit(1);
});

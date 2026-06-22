import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  DynamoDBClient,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.DDB_TABLE || 'WineTracker';
const REGION = process.env.AWS_REGION || 'eu-north-1';
const FILE_PATH = process.argv[2];
const SHEET_NAME = process.argv[3] || undefined;
const DRY_RUN = process.env.DRY_RUN === '1';
const SKIP_AWS = DRY_RUN || process.env.SKIP_AWS === '1';
const IMAGE_MAPPING_JSON = process.env.IMAGE_MAPPING_JSON || '';
const S3_BUCKET = process.env.S3_BUCKET || 'wine-tracker-media';
const UPLOAD_IMAGES = process.env.UPLOAD_IMAGES === '1';
const HEADER_ROW_INDEX = Number(process.env.HEADER_ROW_INDEX || 2);

if (!FILE_PATH) {
  console.error('Usage: node scripts/import-wines-from-xlsx.mjs <path-to-file.xlsx> [sheet-name]');
  process.exit(1);
}

const MEMBER_NAMES = (process.env.MEMBERS || 'Marten,Mirjam,Alex,Sofia')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const MISSING_MARKERS = new Set(['', '-', '–', '?', 'x', 'X']);

const excelSerialToDate = serial => {
  if (!Number.isFinite(serial)) return null;

  // Excel serial date epoch starts at 1899-12-30 for modern files.
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);

  if (Number.isNaN(dateInfo.getTime())) return null;

  const fractionalDay = serial - Math.floor(serial);
  const totalSeconds = Math.round(86400 * fractionalDay);

  dateInfo.setUTCHours(0, 0, 0, 0);
  dateInfo.setUTCSeconds(totalSeconds);

  return dateInfo;
};

const toIsoDate = raw => {
  if (!raw) return '';

  if (typeof raw === 'number') {
    const parsedDate = excelSerialToDate(raw);
    if (!parsedDate) return '';
    return parsedDate.toISOString().slice(0, 10);
  }

  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }

  const str = String(raw).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const dmy = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return '';
};

const numOrDefault = (value, fallback = 0) => {
  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
};

const parseRating = value => {
  const raw = value === null || value === undefined ? '' : String(value).trim();
  if (MISSING_MARKERS.has(raw)) return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const get = (row, keys, fallback = '') => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') {
      return row[key];
    }
  }
  return fallback;
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const looksLikeHttpUrl = value => /^https?:\/\//i.test(String(value || '').trim());

const loadImageMap = () => {
  if (!IMAGE_MAPPING_JSON) return new Map();

  const raw = fs.readFileSync(IMAGE_MAPPING_JSON, 'utf-8');
  const parsed = JSON.parse(raw);
  const rows = new Map();

  for (const item of parsed.items || []) {
    if (!item?.row || !item?.file) continue;
    rows.set(Number(item.row), String(item.file));
  }

  return rows;
};

const ddb = SKIP_AWS ? null : DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3Client = SKIP_AWS ? null : new S3Client({ region: REGION });

const normalizeCellValue = value => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value;

  if (value && typeof value === 'object') {
    if (value.result !== undefined && value.result !== null) return normalizeCellValue(value.result);
    if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
    if (value.text !== undefined && value.text !== null) return String(value.text);
    if (value.hyperlink !== undefined && value.hyperlink !== null) return String(value.text || value.hyperlink);
  }

  return String(value);
};

const worksheetRowsToObjects = (worksheet, headerRowIndex) => {
  const headerRow = worksheet.getRow(headerRowIndex);
  const maxColumn = headerRow.cellCount;

  const headers = [];
  for (let col = 1; col <= maxColumn; col += 1) {
    const headerValue = normalizeCellValue(headerRow.getCell(col).value);
    headers.push(String(headerValue || '').trim());
  }

  const parsedRows = [];
  for (let rowNumber = headerRowIndex + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rowObj = { __rowNum__: rowNumber - 1 };
    let hasAnyValue = false;

    for (let col = 1; col <= maxColumn; col += 1) {
      const header = headers[col - 1];
      if (!header) continue;
      const value = normalizeCellValue(row.getCell(col).value);
      rowObj[header] = value;
      if (String(value || '').trim() !== '') hasAnyValue = true;
    }

    if (hasAnyValue) parsedRows.push(rowObj);
  }

  return parsedRows;
};

const loadExistingSequences = async () => {
  if (SKIP_AWS) {
    return new Map();
  }

  const byDate = new Map();
  let ExclusiveStartKey;

  do {
    const response = await ddb.send(new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: 'wineId, tastedDate',
      ExclusiveStartKey,
    }));

    for (const item of response.Items || []) {
      const date = item.tastedDate;
      const wineId = item.wineId;
      if (!date || !wineId) continue;

      const ymd = date.replace(/-/g, '');
      const match = String(wineId).match(new RegExp(`^${ymd}-(\\d+)$`));
      if (!match) continue;

      const seq = Number(match[1]);
      const prev = byDate.get(date) || 0;
      if (seq > prev) byDate.set(date, seq);
    }

    ExclusiveStartKey = response.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return byDate;
};

const nextWineId = (date, sequenceMap) => {
  const next = (sequenceMap.get(date) || 0) + 1;
  sequenceMap.set(date, next);
  return `${date.replace(/-/g, '')}-${next}`;
};

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(FILE_PATH);

const targetSheet = SHEET_NAME || workbook.worksheets[0]?.name;
const sheet = targetSheet ? workbook.getWorksheet(targetSheet) : null;

if (!sheet) {
  console.error(`Sheet not found: ${targetSheet}`);
  process.exit(1);
}

const rows = worksheetRowsToObjects(sheet, HEADER_ROW_INDEX);
if (!rows.length) {
  console.log('No rows found in sheet, nothing to import.');
  process.exit(0);
}

const sequenceMap = await loadExistingSequences();
const imageMapByRow = loadImageMap();

const items = [];
let skipped = 0;
let lastDate = '';
let uploadedImages = 0;

for (const row of rows) {
  const rowDate = toIsoDate(get(row, ['tastedDate', 'Tasted Date', 'date', 'Date', 'kpv', 'Kpv', 'KPv', 'kuupäev', 'Kuupäev', 'kuupaev', 'Kuupaev']));
  if (rowDate) lastDate = rowDate;
  const tastedDate = rowDate || lastDate;

  const wineName = String(get(row, ['wineName', 'Wine Name', 'name', 'Name', 'nimi', 'Nimi'])).trim();

  if (!tastedDate || !wineName) {
    skipped += 1;
    continue;
  }

  const memberRatings = {};
  for (const member of MEMBER_NAMES) {
    const value = get(row, [
      `memberRatings.${member}`,
      member,
      `${member} Rating`,
      `${member.toLowerCase()}Rating`,
    ], '');

    const parsedRating = parseRating(value);
    if (parsedRating === null) continue;
    memberRatings[member] = parsedRating;
  }

  const avgFromSheet = get(row, ['groupAverage', 'Group Avg', 'Group Average', 'Avg.', 'Avg', 'avg', 'Keskmine', 'keskmine'], '');
  const computedAverage = Object.values(memberRatings).length
    ? Number((Object.values(memberRatings).reduce((a, b) => a + b, 0) / Object.values(memberRatings).length).toFixed(2))
    : 0;

  const parsedAvg = parseRating(avgFromSheet);

  const rawImageUrl = String(get(row, ['imageUrl', 'Image URL', 'image', 'Pilt', 'pilt'], '')).trim();

  const item = {
    wineId: String(get(row, ['wineId', 'Wine ID', 'id'], '')).trim() || nextWineId(tastedDate, sequenceMap),
    tastedDate,
    wineName,
    country: String(get(row, ['country', 'Country', 'riik', 'Riik'], '')).trim(),
    berry: String(get(row, ['berry', 'Berry', 'Grape', 'Varietal', 'mari', 'Mari'], '')).trim(),
    closureType: String(get(row, ['closureType', 'Closure', 'Closure Type', 'Kork/keerd', 'kork/keerd'], '')).trim(),
    vol: numOrDefault(get(row, ['vol', 'ABV', 'abv', 'Vol'], 0), 0),
    imageUrl: looksLikeHttpUrl(rawImageUrl) ? rawImageUrl : '',
    comment: String(get(row, ['comment', 'Comment', 'Kommentaar', 'kommentaar', 'Tasting Notes', 'Notes', 'comm'], '')).trim(),
    groupAverage: parsedAvg === null ? computedAverage : parsedAvg,
    memberRatings,
  };

  const rowNum = Number(row.__rowNum__) + 1;
  const mappedImagePath = imageMapByRow.get(rowNum);

  if (!item.imageUrl && mappedImagePath && UPLOAD_IMAGES) {
    const fileBuffer = fs.readFileSync(mappedImagePath);
    const ext = path.extname(mappedImagePath).toLowerCase();
    const contentType = ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
      ? 'image/webp'
      : 'application/octet-stream';

    const objectKey = `uploads/legacy/${item.wineId}${ext || '.png'}`;

    if (!SKIP_AWS) {
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: objectKey,
        Body: fileBuffer,
        ContentType: contentType,
      }));
    }

    item.imageUrl = `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${objectKey}`;
    uploadedImages += 1;
  }

  items.push(item);
}

console.log(`Parsed rows: ${rows.length}`);
console.log(`Prepared items: ${items.length}`);
console.log(`Skipped rows (missing date or name): ${skipped}`);
console.log(`Mapped images uploaded: ${uploadedImages}`);

if (DRY_RUN) {
  console.log('DRY_RUN=1, not writing to DynamoDB. Sample item:');
  console.log(JSON.stringify(items[0], null, 2));
  process.exit(0);
}

for (const batch of chunk(items, 25)) {
  const RequestItems = {
    [TABLE_NAME]: batch.map(Item => ({ PutRequest: { Item } })),
  };

  await ddb.send(new BatchWriteCommand({ RequestItems }));
}

console.log(`Imported ${items.length} items into ${TABLE_NAME}.`);

import base64
import json
import os
from decimal import Decimal

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
MEDIA_BUCKET = os.environ["MEDIA_BUCKET"]
MEDIA_CDN_DOMAIN = os.environ["MEDIA_CDN_DOMAIN"]

TABLE = boto3.resource("dynamodb").Table(TABLE_NAME)
S3 = boto3.client("s3")


class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            if obj % 1 == 0:
                return int(obj)
            return float(obj)
        return super().default(obj)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
        },
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def parse_body(event):
    raw = event.get("body")
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def scan_all_items():
    items = []
    kwargs = {}

    while True:
        result = TABLE.scan(**kwargs)
        items.extend(result.get("Items", []))
        if "LastEvaluatedKey" not in result:
            break
        kwargs["ExclusiveStartKey"] = result["LastEvaluatedKey"]

    items.sort(key=lambda x: x.get("wineId", ""), reverse=True)
    return items


def put_image_if_present(payload, wine_id):
    upload = payload.get("uploadImage")
    if not upload:
        return payload.get("imageUrl", "")

    file_name = upload.get("fileName", "image.jpg")
    content_type = upload.get("contentType", "application/octet-stream")
    data_base64 = upload.get("dataBase64", "")

    if not data_base64:
        return payload.get("imageUrl", "")

    blob = base64.b64decode(data_base64)
    object_key = f"uploads/{wine_id}/{file_name}"

    S3.put_object(
        Bucket=MEDIA_BUCKET,
        Key=object_key,
        Body=blob,
        ContentType=content_type,
    )

    return f"https://{MEDIA_CDN_DOMAIN}/{object_key}"


def normalize_item(payload, wine_id):
    image_url = put_image_if_present(payload, wine_id)

    return {
        "wineId": wine_id,
        "tastedDate": payload.get("tastedDate", ""),
        "wineName": payload.get("wineName", ""),
        "country": payload.get("country", ""),
        "berry": payload.get("berry", ""),
        "closureType": payload.get("closureType", ""),
        "vol": Decimal(str(payload.get("vol", 0) or 0)),
        "imageUrl": image_url,
        "comment": payload.get("comment", ""),
        "groupAverage": Decimal(str(payload.get("groupAverage", 0) or 0)),
        "memberRatings": {
            name: Decimal(str(value))
            for name, value in (payload.get("memberRatings") or {}).items()
            if value is not None and str(value).strip() != ""
        },
    }


def delete_images_for_wine(wine_id):
    prefix = f"uploads/{wine_id}/"
    continuation_token = None
    deleted_count = 0

    while True:
        list_kwargs = {
            "Bucket": MEDIA_BUCKET,
            "Prefix": prefix,
            "MaxKeys": 1000,
        }
        if continuation_token:
            list_kwargs["ContinuationToken"] = continuation_token

        listed = S3.list_objects_v2(**list_kwargs)
        contents = listed.get("Contents", [])
        if contents:
            objects = [{"Key": obj["Key"]} for obj in contents]
            S3.delete_objects(Bucket=MEDIA_BUCKET, Delete={"Objects": objects})
            deleted_count += len(objects)

        if not listed.get("IsTruncated"):
            break
        continuation_token = listed.get("NextContinuationToken")

    return deleted_count


def handler(event, _context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "")
    raw_path = event.get("rawPath", "")

    if method == "OPTIONS":
        return response(200, {"ok": True})

    if method == "GET" and raw_path == "/api/wines":
        return response(200, scan_all_items())

    if method == "POST" and raw_path == "/api/wines":
        payload = parse_body(event)
        wine_id = payload.get("wineId")
        if not wine_id:
            return response(400, {"message": "wineId is required"})

        item = normalize_item(payload, wine_id)
        TABLE.put_item(Item=item)
        return response(200, item)

    if method == "PUT" and raw_path.startswith("/api/wines/"):
        payload = parse_body(event)
        wine_id = event.get("pathParameters", {}).get("wineId")
        if not wine_id:
            return response(400, {"message": "wineId path parameter is required"})

        item = normalize_item(payload, wine_id)
        TABLE.put_item(Item=item)
        return response(200, item)

    if method == "DELETE" and raw_path.startswith("/api/wines/"):
        wine_id = event.get("pathParameters", {}).get("wineId")
        if not wine_id:
            return response(400, {"message": "wineId path parameter is required"})

        try:
            deleted_media_objects = delete_images_for_wine(wine_id)
        except Exception as exc:
            return response(500, {
                "message": "Failed to delete wine images from media bucket",
                "wineId": wine_id,
                "error": str(exc),
            })

        TABLE.delete_item(Key={"wineId": wine_id})
        return response(200, {
            "deleted": True,
            "wineId": wine_id,
            "deletedMediaObjects": deleted_media_objects,
        })

    return response(404, {"message": f"No route for {method} {raw_path}"})

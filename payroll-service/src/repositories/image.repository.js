const config = require('../config');

const PREFIX = 'employees/';
const keyFor = employeeId => `${PREFIX}${employeeId}/photo`;

let cached;
function s3() {
  if (!cached) {
    const sdk = require('@aws-sdk/client-s3');
    cached = { sdk, client: new sdk.S3Client({ region: config.aws.region }) };
  }
  return cached;
}

async function put(employeeId, body, contentType) {
  const { sdk, client } = s3();
  await client.send(new sdk.PutObjectCommand({
    Bucket: config.aws.s3Bucket,
    Key: keyFor(employeeId),
    Body: body,
    ContentType: contentType
  }));
}

async function remove(employeeId) {
  const { sdk, client } = s3();
  await client.send(new sdk.DeleteObjectCommand({ Bucket: config.aws.s3Bucket, Key: keyFor(employeeId) }));
}

async function signedUrl(employeeId) {
  const { sdk, client } = s3();
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  return getSignedUrl(client, new sdk.GetObjectCommand({ Bucket: config.aws.s3Bucket, Key: keyFor(employeeId) }),
    { expiresIn: config.imageUrlTtlSeconds });
}

async function listEmployeeIds() {
  const { sdk, client } = s3();
  const ids = [];
  let token;
  do {
    const page = await client.send(new sdk.ListObjectsV2Command({
      Bucket: config.aws.s3Bucket,
      Prefix: PREFIX,
      ContinuationToken: token
    }));
    for (const object of page.Contents || []) {
      const match = /^employees\/(\d+)\/photo$/.exec(object.Key);
      if (match) ids.push(Number(match[1]));
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return ids;
}

module.exports = { put, remove, signedUrl, listEmployeeIds };

const config = require('../config');
const repository = require('../repositories/image.repository');
const { fetchEmployee } = require('./employee.client');
const awsService = require('./aws.service');
const HttpError = require('../utils/http-error');

function detectType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function parseEmployeeId(value) {
  const id = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(id) || id <= 0) {
    throw new HttpError(400, 'employeeId must be a positive integer');
  }
  return id;
}

function storageFailure(error) {
  console.error('Image storage failed:', error.name, '-', error.message);
  return new HttpError(503, 'Image storage unavailable');
}

function ensureAvailable() {
  if (!awsService.isEnabled() || !config.aws.s3Bucket) throw new HttpError(503, 'Image storage unavailable');
}

async function listUrls() {
  if (!awsService.isEnabled() || !config.aws.s3Bucket) return {};
  try {
    const ids = await repository.listEmployeeIds();
    const entries = await Promise.all(ids.map(async id => [id, await repository.signedUrl(id)]));
    return Object.fromEntries(entries);
  } catch (error) {
    throw storageFailure(error);
  }
}

async function upload(employeeIdParam, body, token) {
  const employeeId = parseEmployeeId(employeeIdParam);
  ensureAvailable();
  if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, 'Send the image file as the request body');
  const contentType = detectType(body);
  if (!contentType) throw new HttpError(400, 'Image must be a JPEG, PNG or WebP file');
  await fetchEmployee(employeeId, token);
  try {
    await repository.put(employeeId, body, contentType);
    return { employeeId, url: await repository.signedUrl(employeeId) };
  } catch (error) {
    throw storageFailure(error);
  }
}

async function remove(employeeIdParam) {
  const employeeId = parseEmployeeId(employeeIdParam);
  ensureAvailable();
  try {
    await repository.remove(employeeId);
  } catch (error) {
    throw storageFailure(error);
  }
}

module.exports = { listUrls, upload, remove };

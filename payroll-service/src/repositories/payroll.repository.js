const fs = require('node:fs/promises');
const config = require('../config');

let writeQueue = Promise.resolve();

async function readRecords() {
  try {
    const content = await fs.readFile(config.recordsPath, 'utf8');
    const records = JSON.parse(content);
    return Array.isArray(records) ? records : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function serializeWrite(operation) {
  const pending = writeQueue.then(operation);
  writeQueue = pending.catch(() => {});
  return pending;
}

async function saveRecords(records) {
  await fs.mkdir(config.dataDir, { recursive: true });
  const temporaryPath = `${config.recordsPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, config.recordsPath);
}

async function findAll() {
  await writeQueue;
  return readRecords();
}

async function findById(id) {
  await writeQueue;
  const records = await readRecords();
  return records.find(item => item.id === id);
}

// Returns the saved record, or null when a run already exists for this employee and period.
function insertUnique(employeeId, period, buildRecord) {
  return serializeWrite(async () => {
    const records = await readRecords();
    if (records.some(record => record.employeeId === employeeId && record.period === period)) {
      return null;
    }
    const record = buildRecord();
    records.push(record);
    await saveRecords(records);
    return record;
  });
}

module.exports = { findAll, findById, insertUnique };

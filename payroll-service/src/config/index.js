const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const dataDir = path.join(__dirname, '..', '..', 'data');

const jwtSecret = process.env.JWT_SECRET || '';
if (Buffer.byteLength(jwtSecret) < 32) {
  throw new Error('JWT_SECRET is missing or shorter than 32 characters. Set the same value in payroll-service/.env as in employee-service/.env (see .env.example).');
}

module.exports = {
  jwtSecret,
  jwtIssuer: 'payroll-capstone-employee-service',
  jwtAudience: 'payroll-capstone',
  port: Number(process.env.PORT || 3001),
  employeeServiceUrl: (process.env.EMPLOYEE_SERVICE_URL || 'http://localhost:8081').replace(/\/$/, ''),
  corsOrigin: 'http://localhost:5173',
  bodyLimit: '32kb',
  dataDir,
  recordsPath: path.join(dataDir, 'payroll-runs.json'),
  aws: {
    enabled: String(process.env.AWS_ENABLED || 'false').toLowerCase() === 'true',
    region: process.env.AWS_REGION || 'us-east-1',
    s3Bucket: (process.env.AWS_S3_BUCKET || '').trim()
  },
  imageMaxBytes: 2 * 1024 * 1024,
  imageUrlTtlSeconds: 300
};

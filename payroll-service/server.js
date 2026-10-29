const config = require('./src/config');
const app = require('./src/app');

app.listen(config.port, () => {
  console.log(`Payroll service listening on port ${config.port}`);
  console.log(`AWS: ${config.aws.enabled ? 'enabled' : 'OFFLINE (AWS_ENABLED is not true)'} | S3 bucket: ${config.aws.s3Bucket || '(none)'}`);
});

const config = require('../config');

function isEnabled() {
  return config.aws.enabled;
}

async function getCallerIdentity() {
  const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
  const client = new STSClient({ region: config.aws.region });
  const identity = await client.send(new GetCallerIdentityCommand({}));
  const account = typeof identity.Account === 'string' ? `****${identity.Account.slice(-4)}` : null;
  const arn = typeof identity.Arn === 'string'
    ? identity.Arn.replace(/:user\/([^/]+)/, ':user/***').replace(/:role\/([^/]+)/, ':role/***')
    : null;
  return { account, arn };
}

module.exports = { isEnabled, getCallerIdentity };

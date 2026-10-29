const config = require('../config');
const HttpError = require('../utils/http-error');

// employee-service requires a signed-in user, so the caller's token is passed along.
async function fetchEmployee(employeeId, token) {
  const response = await fetch(`${config.employeeServiceUrl}/api/employees/${encodeURIComponent(Number(employeeId))}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) throw new HttpError(404, 'Employee not found');
  if (response.status === 401) throw new HttpError(401, 'Sign in required');
  if (!response.ok) throw new HttpError(502, 'Employee service unavailable');
  return response.json();
}

module.exports = { fetchEmployee };

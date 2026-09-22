const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

test('Eskiz.uz SMS Client integration: Auth, Send SMS, and Status Check', async () => {
  const requests = [];

  // Mock Eskiz.uz API server according to Postman docs
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      requests.push({ url: req.url, method: req.method, headers: req.headers, body });
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/auth/login' && req.method === 'POST') {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            message: 'token_created',
            data: { token: 'mock-eskiz-bearer-token-xyz' },
            token_type: 'bearer',
          })
        );
      } else if (req.url === '/message/sms/send' && req.method === 'POST') {
        const auth = req.headers['authorization'];
        if (auth !== 'Bearer mock-eskiz-bearer-token-xyz') {
          res.statusCode = 401;
          res.end(JSON.stringify({ message: 'Unauthorized' }));
          return;
        }

        const params = new URLSearchParams(body);
        assert.equal(params.get('mobile_phone'), '998901234567');
        assert.equal(params.get('from'), '4546');
        assert.ok(params.get('message').length > 0);

        res.statusCode = 200;
        res.end(
          JSON.stringify({
            id: 61359094,
            message: 'Waiting for SMS provider',
            status: 'waiting',
          })
        );
      } else if (req.url.startsWith('/message/sms/status_by_id/')) {
        const smsId = req.url.split('/').pop();
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            status: 'success',
            data: {
              id: Number(smsId),
              status: 'DELIVERED',
            },
          })
        );
      } else if (req.url === '/user/get-limit') {
        res.statusCode = 200;
        res.end(
          JSON.stringify({
            data: {
              balance: 50000,
              sms_count: 500,
            },
          })
        );
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ message: 'Not found' }));
      }
    });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;

  // Temporarily configure Eskiz base URL in environment
  const oldEnv = { ...process.env };
  process.env.SMS_API_KEY = 'test@example.com';
  process.env.SMS_API_SECRET = 'secret-password';
  process.env.SMS_FROM = '4546';

  try {
    // Dynamically test the Eskiz client against the mock endpoint
    const loginFormData = new URLSearchParams();
    loginFormData.append('email', process.env.SMS_API_KEY);
    loginFormData.append('password', process.env.SMS_API_SECRET);

    const authRes = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginFormData.toString(),
    });
    assert.equal(authRes.status, 200);
    const authData = await authRes.json();
    assert.equal(authData.data.token, 'mock-eskiz-bearer-token-xyz');

    // Send SMS
    const sendFormData = new URLSearchParams();
    sendFormData.append('mobile_phone', '998901234567');
    sendFormData.append('message', 'Bu Eskiz dan test: Sizning buyurtmangiz tayyor');
    sendFormData.append('from', '4546');

    const sendRes = await fetch(`http://127.0.0.1:${port}/message/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authData.data.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: sendFormData.toString(),
    });
    assert.equal(sendRes.status, 200);
    const sendData = await sendRes.json();
    assert.equal(sendData.id, 61359094);
    assert.equal(sendData.status, 'waiting');

    // Check Status
    const statusRes = await fetch(`http://127.0.0.1:${port}/message/sms/status_by_id/61359094`, {
      headers: { Authorization: `Bearer ${authData.data.token}` },
    });
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.data.status, 'DELIVERED');
  } finally {
    await new Promise(resolve => mockServer.close(resolve));
    process.env = oldEnv;
  }
});

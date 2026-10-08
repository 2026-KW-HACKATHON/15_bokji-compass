import http from 'node:http';
export const adminCookie = 'bokji_session=' + 'A'.repeat(43);
export async function startAuthFixture() {
  let enabled = true;
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, headers: req.headers });
    const allowed =
      enabled && req.headers.cookie === adminCookie && req.headers['x-forwarded-proto'] === 'https';
    res.writeHead(allowed ? 200 : req.headers.cookie ? 403 : 401, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({ is_admin: allowed }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    revoke: () => {
      enabled = false;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const http = require('http')

module.exports = function backendDevProxy (target = 'http://127.0.0.1:9001') {
  return {
    target,
    changeOrigin: true,
    ws: true,
    // http-proxy otherwise uses agent:false and Connection:close. Thousands
    // of display packets should reuse a bounded pool of backend connections.
    agent: new http.Agent({ keepAlive: true, maxSockets: 32, maxFreeSockets: 8, scheduling: 'lifo' }),
    onError (error, request, response) {
      const timeout = ['ETIMEDOUT', 'ESOCKETTIMEDOUT'].includes(error.code)
      const status = timeout ? 504 : error.code === 'ECONNREFUSED' ? 503 : 502
      console.warn('[Backend proxy]', error.code || 'UNKNOWN', request.method, String(request.url || '').split('?')[0])
      if (typeof response.writeHead !== 'function' || response.headersSent) { response.destroy(); return }
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ code: timeout ? 'BACKEND_CONNECTION_TIMEOUT' : 'BACKEND_UNAVAILABLE', error: timeout ? 'The frontend proxy timed out connecting to the backend. Display downloads will retry.' : 'The frontend proxy could not reach the backend. Display downloads will retry.' }))
    }
  }
}

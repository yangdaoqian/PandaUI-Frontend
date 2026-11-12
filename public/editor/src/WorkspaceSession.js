(function (global) {
  'use strict'
  if (global.PandaUIWorkspaceReady) return
  var key = 'pandaui-workspace-token-v3'
  var legacyKey = 'pandaui-workspace-token-v2'
  var host = global
  try {
    if (global.parent !== global && global.parent.PandaUIWorkspaceReady) host = global.parent
  } catch (_) {}

  function valid (token) { return /^[a-f0-9]{64}$/.test(token || '') }
  function createToken () {
    return Array.from(global.crypto.getRandomValues(new Uint8Array(32)), function (value) { return value.toString(16).padStart(2, '0') }).join('')
  }
  function claim (token) {
    if (!global.navigator.locks) {
      if (!global.BroadcastChannel) return Promise.resolve(true)
      return new Promise(function (resolve) {
        var channel = new global.BroadcastChannel('pandaui-workspace:' + token)
        var ticket = createToken()
        var held = false
        var occupied = false
        channel.onmessage = function (event) {
          var value = event.data || {}
          if (value.type === 'probe' && (held || ticket < value.ticket)) channel.postMessage({ type: 'held', ticket: value.ticket })
          if (value.type === 'held' && value.ticket === ticket) occupied = true
        }
        channel.postMessage({ type: 'probe', ticket: ticket })
        global.setTimeout(function () {
          if (occupied) channel.close()
          else held = true
          resolve(!occupied)
        }, 150)
      })
    }
    return new Promise(function (resolve, reject) {
      global.navigator.locks.request('pandaui-workspace:' + token, { ifAvailable: true }, function (lock) {
        resolve(!!lock)
        if (lock) return new Promise(function () {})
      }).catch(reject)
    })
  }
  async function initialize () {
    var token = global.sessionStorage.getItem(key)
    var existing = valid(token)
    var legacy = global.localStorage.getItem(legacyKey)
    var migrate = !existing && valid(legacy) && !global.localStorage.getItem(legacyKey + ':migrated')
    if (!existing) token = migrate ? legacy : createToken()
    if (!await claim(token)) {
      global.PandaUIWorkspaceForked = existing
      migrate = false
      do { token = createToken() } while (!await claim(token))
    }
    global.sessionStorage.setItem(key, token)
    global.PandaUIWorkspaceMigrated = migrate
    if (migrate) global.localStorage.setItem(legacyKey + ':migrated', '1')
    return token
  }
  global.PandaUIWorkspaceReady = (host === global ? initialize() : host.PandaUIWorkspaceReady).then(function (token) {
    global.PandaUIWorkspaceToken = token
    if (host !== global) {
      global.PandaUIWorkspaceForked = host.PandaUIWorkspaceForked
      global.PandaUIWorkspaceMigrated = host.PandaUIWorkspaceMigrated
    }
    return token
  })
  global.PandaUILoginReady = (host === global ? global.PandaUIWorkspaceReady.then(async function () {
    var loginKey = 'pandaui-login-client-v1'
    var clientId = global.sessionStorage.getItem(loginKey)
    if (!valid(clientId) || global.PandaUIWorkspaceForked || !await claim(clientId)) {
      do { clientId = createToken() } while (!await claim(clientId))
    }
    global.sessionStorage.setItem(loginKey, clientId)
    return clientId
  }) : host.PandaUILoginReady).then(function (clientId) { global.PandaUILoginClientId = clientId; return clientId })
  var originalFetch = global.fetch.bind(global)
  global.PandaUIBindAccount = async function (userId) {
    await global.PandaUIWorkspaceReady
    var previous = global.sessionStorage.getItem('pandaui-account-user')
    if (previous !== userId) {
      if (previous) global.sessionStorage.setItem(key + ':' + previous, global.PandaUIWorkspaceToken)
      var token = global.sessionStorage.getItem(key + ':' + userId)
      var restored = valid(token) && await claim(token)
      if (!restored) {
        token = createToken()
        while (!await claim(token)) token = createToken()
      }
      global.sessionStorage.setItem(key, token)
      global.sessionStorage.setItem('pandaui-account-user', userId)
      global.PandaUIWorkspaceToken = token
      global.PandaUIWorkspaceReady = Promise.resolve(token)
      global.PandaUIWorkspaceForked = !restored
      global.PandaUIPrivateDocumentId = null
    }
  }
  global.fetch = function (input, options) {
    var url = new URL(typeof input === 'string' ? input : input.url, global.location.href)
    if (url.origin !== global.location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, options)
    if (host.PandaUIBackendMode === 'local' && !url.pathname.startsWith('/api/auth/')) return Promise.reject(Object.assign(new Error('Backend unavailable. Local features remain available.'), { code: 'BACKEND_UNAVAILABLE' }))
    return Promise.all([global.PandaUIWorkspaceReady, global.PandaUILoginReady]).then(function (identities) {
      var token = identities[0]
      var headers = new Headers((options && options.headers) || (typeof input !== 'string' ? input.headers : undefined))
      headers.set('Authorization', 'Bearer ' + token)
      headers.set('X-PandaUI-Client', identities[1])
      headers.set('X-PandaUI-Client-Origin', global.location.origin)
      if (host.PandaUIAuth && host.PandaUIAuth.csrfToken) { headers.set('X-PandaUI-CSRF', host.PandaUIAuth.csrfToken) }
      if (host.PandaUIPrivateDocumentId && !url.pathname.startsWith('/api/auth/')) headers.set('X-PandaUI-Private-Document', host.PandaUIPrivateDocumentId)
      return originalFetch(input, Object.assign({}, options, { headers: headers, credentials: 'same-origin' })).then(function (response) {
        if (response.status === 401 && !url.pathname.startsWith('/api/auth/')) host.dispatchEvent(new CustomEvent('pandaui-auth-required'))
        if (response.status === 409 && !url.pathname.startsWith('/api/auth/')) {
          response.clone().json().then(function (value) {
            if (value.code === 'ACCOUNT_IN_USE') host.dispatchEvent(new CustomEvent('pandaui-login-conflict', { detail: value.error }))
          }).catch(function () {})
        }
        return response
      })
    })
  }
})(window)

<template>
  <template v-if="ready">
    <slot />
    <div class="account-control">
      <q-btn v-if="localMode" dense flat no-caps icon="cloud_off" label="Local mode · Connect backend" :loading="busy" @click="connectBackend" />
      <q-btn v-else dense flat no-caps icon="account_circle" :label="session.user.username" aria-label="Account menu">
        <q-menu>
          <q-list style="min-width: 190px">
            <q-item v-if="session.user.role === 'admin'" clickable v-close-popup @click="showAccounts"><q-item-section>Manage accounts</q-item-section></q-item>
            <q-item clickable v-close-popup @click="passwordDialog = true"><q-item-section>Change password</q-item-section></q-item>
            <q-item clickable v-close-popup @click="logout"><q-item-section>Sign out</q-item-section></q-item>
          </q-list>
        </q-menu>
      </q-btn>
    </div>
  </template>
  <main v-if="!ready || connecting" class="account-login" :class="{ 'account-login--overlay': ready }">
    <login-scene v-if="!ready" />
    <form class="account-card" method="post" :action="registering ? '/api/auth/register' : '/api/auth/login'" :autocomplete="registering || rememberPassword ? 'on' : 'off'" @submit.prevent="registering ? register() : login()">
      <div class="account-brand">PandaUI <span>WORKSPACE</span></div>
      <h1>{{ registering ? 'Create account' : 'Sign in' }}</h1>
      <p>{{ registering ? 'Create your account to join a shared workspace.' : 'Signing in signs this account out of other windows.' }}</p>
      <q-input v-model="username" name="username" outlined label="Username" autocomplete="username" autocapitalize="none" :spellcheck="false" :disable="busy" autofocus />
      <q-input v-model="password" name="password" outlined label="Password" type="password" :autocomplete="registering ? 'new-password' : rememberPassword ? 'current-password' : 'off'" :hint="registering ? 'At least 12 characters' : undefined" :disable="busy" />
      <q-input v-if="registering" v-model="confirmPassword" name="confirmPassword" outlined label="Confirm password" type="password" autocomplete="new-password" :disable="busy" />
      <div v-if="!registering" class="account-remember">
        <q-checkbox v-model="rememberPassword" dense label="Remember password" color="primary" :disable="busy" @update:model-value="updateRememberPassword" />
        <span>Saved by your browser</span>
      </div>
      <div v-if="error" class="account-error" role="alert">{{ error }}</div>
      <div v-if="notice" class="account-success" role="status">{{ notice }}</div>
      <q-btn unelevated no-caps color="primary" type="submit" :label="registering ? 'Create account' : 'Sign in'" :loading="busy" :disable="!username || !password || (registering && !confirmPassword)" />
      <q-btn flat no-caps color="primary" :label="registering ? 'Back to sign in' : 'Register'" :disable="busy" @click="toggleRegistration" />
      <q-btn v-if="connecting || serviceUnavailable" flat no-caps label="Continue locally" :disable="busy" @click="enterLocal" />
    </form>
  </main>
  <q-dialog v-model="accountsDialog">
    <q-card class="account-dialog">
      <q-card-section><div class="text-h6">Accounts</div><div class="text-caption">Administrators can run server code and access server files. Only grant this role to trusted operators.</div></q-card-section>
      <q-card-section>
        <q-list separator>
          <q-item v-for="account in accounts" :key="account.userId">
            <q-item-section><q-item-label>{{ account.username }}</q-item-label><q-item-label caption>{{ account.role }} · {{ account.disabled ? 'Disabled' : 'Active' }}</q-item-label></q-item-section>
            <q-item-section side><q-btn flat dense no-caps :label="account.disabled ? 'Enable' : 'Disable'" :disable="busy || account.userId === session.user.userId" @click="toggleAccount(account)" /></q-item-section>
          </q-item>
        </q-list>
        <form class="account-fields" @submit.prevent="createAccount">
          <q-input v-model="newUsername" outlined dense label="New username" autocomplete="off" />
          <q-input v-model="newPassword" outlined dense label="Password (12+ characters)" type="password" autocomplete="new-password" />
          <q-select v-model="newRole" outlined dense label="Server role" :options="['member', 'admin']" />
          <q-btn unelevated color="primary" no-caps type="submit" label="Create account" :loading="busy" />
        </form>
        <div v-if="error" class="account-error" role="alert">{{ error }}</div>
      </q-card-section>
      <q-card-actions align="right"><q-btn flat label="Close" v-close-popup /></q-card-actions>
    </q-card>
  </q-dialog>
  <q-dialog v-model="passwordDialog">
    <q-card class="account-dialog">
      <q-card-section><div class="text-h6">Change password</div><p>This signs out all sessions for this account.</p></q-card-section>
      <q-card-section><form class="account-fields" @submit.prevent="changePassword">
        <q-input v-model="currentPassword" outlined label="Current password" type="password" autocomplete="current-password" />
        <q-input v-model="replacementPassword" outlined label="New password (12+ characters)" type="password" autocomplete="new-password" />
        <div v-if="error" class="account-error" role="alert">{{ error }}</div>
        <q-btn color="primary" no-caps type="submit" label="Update password" :loading="busy" />
      </form></q-card-section>
    </q-card>
  </q-dialog>
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { readLoginPreference, writeLoginPreference, storeLoginCredential, loadLoginCredential } from '../account/LoginCredentials.js'
import LoginScene from './LoginScene.vue'
import accountRequest from '../account/AccountRequest'

const signedOutMessage = 'This account was signed in from another window. This window has been signed out.'
const accountInUseMessage = 'This account is already signed in from another window. Sign in again to sign out the other window.'

export default {
  components: { LoginScene },
  emits: ['ready'],
  setup (props, { emit }) {
    const ready = ref(false)
    const localMode = ref(false)
    const connecting = ref(false)
    const serviceUnavailable = ref(false)
    const busy = ref(true)
    const error = ref(sessionStorage.getItem('pandaui-login-conflict') ? signedOutMessage : '')
    sessionStorage.removeItem('pandaui-login-conflict')
    const loginPreference = readLoginPreference()
    const rememberPassword = ref(loginPreference.remember)
    const username = ref(loginPreference.username)
    const password = ref('')
    const confirmPassword = ref('')
    const registering = ref(false)
    const notice = ref('')
    const session = ref(null)
    const accountsDialog = ref(false)
    const passwordDialog = ref(false)
    const accounts = ref([])
    const newUsername = ref('')
    const newPassword = ref('')
    const newRole = ref('member')
    const currentPassword = ref('')
    const replacementPassword = ref('')
    let timer
    let expiryTimer
    let checking = false
    let ending = false
    let disposed = false
    async function restoreSavedPassword () {
      if (!rememberPassword.value || ready.value || registering.value || password.value) return
      const previousUsername = username.value
      const credential = await loadLoginCredential()
      if (disposed || !credential || !rememberPassword.value || ready.value || registering.value || password.value || username.value !== previousUsername) return
      if (previousUsername && previousUsername.toLowerCase() !== credential.id.toLowerCase()) return
      username.value = credential.id
      password.value = credential.password
    }
    function updateRememberPassword (remember) {
      writeLoginPreference(remember, remember ? username.value : '')
      if (remember) restoreSavedPassword()
    }
    const request = accountRequest
    function enterLocal () {
      window.PandaUIAuth = null
      window.PandaUIBackendMode = 'local'
      localMode.value = true
      connecting.value = false
      clearTimeout(expiryTimer)
      if (!ready.value) { emit('ready'); ready.value = true }
      window.dispatchEvent(new CustomEvent('pandaui-backend-mode', { detail: { mode: 'local' } }))
    }
    async function connectBackend () {
      connecting.value = true
      await perform(async () => { await activate(await request('session')) })
    }
    function ended () {
      if (!ready.value || localMode.value || ending) return
      ending = true
      window.PandaUIAuth = null
      clearInterval(timer)
      clearTimeout(expiryTimer)
      window.location.reload()
    }
    function loginConflict () {
      const message = ready.value ? signedOutMessage : accountInUseMessage
      if (ready.value) { sessionStorage.setItem('pandaui-login-conflict', message); ended() } else { error.value = message; window.PandaUIAuth = null }
    }
    async function activate (value) {
      if (!value?.user?.userId || !Number.isFinite(value.expiresAt)) throw new Error('The sign-in service returned an invalid session.')
      window.PandaUIAuth = value
      try {
        await window.PandaUIBindAccount(value.user.userId)
        await request('workspace', {})
      } catch (failure) { window.PandaUIAuth = null; throw failure }
      session.value = value
      const wasLocal = localMode.value
      window.PandaUIBackendMode = 'online'
      localMode.value = false
      connecting.value = false
      serviceUnavailable.value = false
      if (!ready.value) emit('ready')
      ready.value = true
      clearTimeout(expiryTimer)
      expiryTimer = setTimeout(ended, Math.max(1, value.expiresAt - Date.now()))
      if (wasLocal) window.dispatchEvent(new CustomEvent('pandaui-backend-mode', { detail: { mode: 'online' } }))
    }
    async function perform (action) {
      if (busy.value) return
      busy.value = true
      error.value = ''
      try { await action() } catch (failure) { error.value = failure.message; serviceUnavailable.value = failure.code === 'BACKEND_UNAVAILABLE' } finally { busy.value = false }
    }
    async function login () {
      await perform(async () => {
        const value = await request('login', { username: username.value, password: password.value })
        storeLoginCredential(value.user.username, password.value, rememberPassword.value)
        await activate(value)
        password.value = ''
      })
    }
    function toggleRegistration () {
      registering.value = !registering.value
      password.value = ''; confirmPassword.value = ''; error.value = ''; notice.value = ''
      if (!registering.value) restoreSavedPassword()
    }
    async function register () {
      await perform(async () => {
        if (password.value !== confirmPassword.value) throw new Error('Passwords do not match.')
        await request('register', { username: username.value, password: password.value, confirmPassword: confirmPassword.value })
        password.value = ''; confirmPassword.value = ''; registering.value = false
        notice.value = 'Account created. Sign in with your new password.'
      })
    }
    async function logout () { await perform(async () => { await request('logout', {}); window.location.reload() }) }
    async function loadAccounts () { accounts.value = (await request('users')).users }
    async function showAccounts () { accountsDialog.value = true; await perform(loadAccounts) }
    async function createAccount () {
      await perform(async () => {
        await request('users', { username: newUsername.value, password: newPassword.value, role: newRole.value })
        newPassword.value = ''; newUsername.value = ''; newRole.value = 'member'
        await loadAccounts()
      })
    }
    async function toggleAccount (account) { await perform(async () => { await request('users/disable', { userId: account.userId, disabled: !account.disabled }); await loadAccounts() }) }
    async function changePassword () { await perform(async () => { await request('password', { currentPassword: currentPassword.value, password: replacementPassword.value }); window.location.reload() }) }
    async function checkSession () {
      if (!ready.value || localMode.value || checking) return
      checking = true
      try {
        const value = await request('session')
        if (value.user.userId !== session.value.user.userId || value.csrfToken !== session.value.csrfToken) ended()
      } catch (failure) {
        if (failure.code === 'ACCOUNT_IN_USE') loginConflict({ detail: failure.message })
        else if (failure.status === 401) ended()
        else if (failure.code === 'BACKEND_UNAVAILABLE') enterLocal()
      } finally { checking = false }
    }
    onMounted(async () => {
      window.addEventListener('pandaui-auth-required', ended)
      window.addEventListener('pandaui-login-conflict', loginConflict)
      window.addEventListener('focus', checkSession)
      try { await activate(await request('session')) } catch (failure) {
        if (!disposed && failure.code === 'BACKEND_UNAVAILABLE') enterLocal()
        else if (failure.status !== 401) error.value = failure.message
      } finally { busy.value = false }
      if (!ready.value) restoreSavedPassword()
      timer = setInterval(checkSession, 15000)
    })
    onBeforeUnmount(() => { disposed = true; clearInterval(timer); clearTimeout(expiryTimer); window.removeEventListener('pandaui-auth-required', ended); window.removeEventListener('pandaui-login-conflict', loginConflict); window.removeEventListener('focus', checkSession) })
    return { ready, localMode, connecting, serviceUnavailable, connectBackend, enterLocal, busy, error, username, password, rememberPassword, updateRememberPassword, confirmPassword, registering, notice, register, toggleRegistration, session, accountsDialog, passwordDialog, accounts, newUsername, newPassword, newRole, currentPassword, replacementPassword, login, logout, showAccounts, createAccount, toggleAccount, changePassword }
  }
}
</script>

<style scoped>
.account-login { position: relative; isolation: isolate; min-height: 100vh; min-height: 100dvh; display: grid; place-items: center; padding: 24px; color: #254657; }
.account-login--overlay { position: fixed; inset: 0; z-index: 6000; background: #10203040; backdrop-filter: blur(8px); }
.account-card { position: relative; z-index: 1; display: grid; gap: 20px; width: min(420px, 100%); padding: 36px; border-radius: 24px; border: 1px solid #ffffff80; background: linear-gradient(145deg, rgb(235 247 255 / 25%), rgb(255 255 255 / 25%) 50%, rgb(232 255 242 / 25%)); backdrop-filter: blur(8px) saturate(115%); -webkit-backdrop-filter: blur(8px) saturate(115%); box-shadow: 0 24px 80px #2948591a, inset 0 1px 0 #ffffff66; }
.account-card :deep(.q-field__control) { background: #ffffff40; border-radius: 10px; }
.account-remember { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: -4px; }
.account-remember :deep(.q-checkbox__label) { font-size: 13px; }
.account-remember > span { color: #56717e; font-size: 11px; }
.account-brand { font-size: 21px; font-weight: 700; }.account-brand span { margin-left: 10px; font-size: 10px; letter-spacing: 2px; color: #6e8897; }
.account-card h1 { font-size: 28px; line-height: 1.3; margin: 14px 0 -12px; }.account-card p { color: #486371; margin: 0; }.account-card small { text-align: center; color: #6e8897; }
.account-control { position: fixed; top: 6px; right: 12px; z-index: 5000; background: #ffffffb3; color: #29475a; border-radius: 18px; }
.account-dialog { width: 460px; max-width: 95vw; }.account-fields { display: grid; gap: 14px; margin-top: 20px; }.account-error { color: #bc3349; font-size: 13px; margin-top: 6px; }
.account-success { color: #237a62; font-size: 13px; }
@media (max-width: 480px) {
  .account-login { padding: 16px; }
  .account-card { padding: 28px 22px; gap: 18px; }
  .account-remember { flex-wrap: wrap; gap: 8px; }
}
</style>

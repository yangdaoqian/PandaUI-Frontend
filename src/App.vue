<template>
    <!-- <div class="release-review-notice" role="status">PandaUI workspace</div> -->
    <account-gate @ready="initialize"><router-view /></account-gate>
</template>

<script>
import PandaUIApp from './PandaUIApp.js'
import AccountGate from './components/AccountGate.vue'

export default {
  name: 'App',
  components: { AccountGate },
  methods: {
    initialize () {
      PandaUIApp.init(window.NodeC, this.showLoading, this.hideLoading)
    },
    showLoading () {
      this.$q.loading.show()
    },
    hideLoading () {
      this.$q.loading.hide()
    }
  }
}
</script>

<style>
.release-review-notice { position: fixed; bottom: 8px; left: 8px; z-index: 10000; max-width: calc(100vw - 16px); padding: 6px 10px; background: #fff3cd; color: #473900; font: 12px sans-serif; pointer-events: none; }
</style>

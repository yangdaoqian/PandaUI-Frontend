<template>
  <teleport to="body">
    <section v-for="layout in layouts" :key="layout.nodeId" v-show="layout.visible"
      class="pandaui-panel pandaui-panel-node" :data-panel="panelId" :data-node-id="layout.nodeId"
      :inert="active ? null : ''" :class="{ 'pandaui-panel-node--inactive': !active }"
      :style="surfaceStyle(layout)" @pointerdown.stop @dblclick.stop @wheel.stop>
      <slot />
    </section>
  </teleport>
</template>

<script>
export default {
  name: 'PanelNodeSurface',
  inheritAttrs: false,
  props: {
    panelId: { type: String, required: true },
    layouts: { type: Array, default: () => [] },
    active: Boolean
  },
  setup () {
    const surfaceStyle = layout => ({
      left: `${layout.left}px`,
      top: `${layout.top}px`,
      width: `${layout.width}px`,
      height: `${layout.height}px`,
      transform: `scale(${layout.scale})`,
      zIndex: layout.selected ? 1020 : 1010
    })
    return { surfaceStyle }
  }
}
</script>

<style>
.pandaui-panel.pandaui-panel-node {
  position: fixed;
  z-index: 1010;
  transform-origin: top left;
  overflow: auto;
  overscroll-behavior: contain;
  background: transparent !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  color: var(--node-text-color, #eef2f4);
  font-family: var(--node-font-family, Arial);
  font-size: var(--node-font-size, 12px);
  border-radius: 4px;
  pointer-events: auto;
}
.pandaui-panel-node .pandaui-panel__toolbar {
  background: transparent !important;
  box-shadow: none !important;
}
.pandaui-panel-node.pandaui-panel-node--inactive,
.pandaui-panel-node--inactive * { pointer-events: none !important; }
.pandaui-panel-node .q-field--filled .q-field__control { background: var(--node-control-bg, rgba(238, 243, 245, 0.25)); }
.pandaui-panel-node .text-white,
.pandaui-panel-node .q-field__native,
.pandaui-panel-node .q-field__input,
.pandaui-panel-node .q-field__label,
.pandaui-panel-node .q-field__marginal,
.pandaui-panel-node .q-item__label--header,
.pandaui-panel-node .q-item__label--caption { color: var(--node-text-color, #eef2f4) !important; }
.pandaui-panel-node .q-toolbar-title { color: var(--node-title-color, #eef2f4); }
.pandaui-panel-node .q-toolbar-title { font-size: 16px; min-width: 0; }
.pandaui-panel-node .q-item { min-width: 0; }
.pandaui-panel-node .q-item__section--main { min-width: 0; overflow-wrap: anywhere; }
.pandaui-panel-node .q-field { min-width: 0; }
.pandaui-panel-node input[type="color"] { min-width: 36px; min-height: 24px; padding: 0; }
</style>

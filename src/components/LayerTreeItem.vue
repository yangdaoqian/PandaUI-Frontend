<template>
  <q-expansion-item
    dense
    :expand-icon="node.children && node.children.length > 0 ? undefined : ''"
    :label="node.label"
  >
    <template v-slot:header>
      <q-item-section avatar>
        <q-toggle :model-value="node.visible" @update:model-value="setVisible" />
      </q-item-section>
      <q-item-section>{{ node.label }}</q-item-section>
    </template>
    <layer-tree-item
      v-for="child in node.children"
      :key="child.fullPath"
      :node="child"
      class="q-pl-md"
      @visibility-change="$emit('visibility-change', $event)"
    />
  </q-expansion-item>
</template>

<script>
export default {
  name: 'LayerTreeItem',
  props: {
    node: { type: Object, required: true }
  },
  emits: ['visibility-change'],
  methods: {
    setVisible (visible) {
      this.$emit('visibility-change', { node: this.node, visible })
    }
  }
}
</script>

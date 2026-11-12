import defineToolbarItem from './defineToolbarItem'

function execute ({ editorMode }) {
  editorMode.value = !editorMode.value
}

export default defineToolbarItem({
  id: 'editor-mode',
  kind: 'action',
  icon: 'account_tree',
  activeIcon: '3d_rotation',
  tooltip: 'Switch to node editor controls',
  activeTooltip: 'Switch to 3D view controls',
  active: 'editorMode',
  execute
})

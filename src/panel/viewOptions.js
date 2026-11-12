import defineToolbarItem from './defineToolbarItem'

function execute ({ drawer }) {
  drawer.toggle('VIEW_PRESET')
}

export default defineToolbarItem({
  id: 'view-options',
  kind: 'drawer',
  drawer: 'VIEW_PRESET',
  icon: 'view_in_ar',
  tooltip: 'View options',
  execute
})

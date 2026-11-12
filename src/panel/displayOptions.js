import defineToolbarItem from './defineToolbarItem'

function execute ({ drawer }) {
  drawer.toggle('VIEW')
}

export default defineToolbarItem({
  id: 'display-options',
  kind: 'drawer',
  drawer: 'VIEW',
  icon: 'aspect_ratio',
  tooltip: 'Display options',
  execute
})

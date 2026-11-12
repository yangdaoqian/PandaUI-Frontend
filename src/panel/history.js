import defineToolbarItem from './defineToolbarItem'

export default defineToolbarItem({
  id: 'history',
  kind: 'drawer',
  drawer: 'HISTORY',
  icon: 'history',
  tooltip: 'History',
  execute: ({ drawer }) => drawer.toggle('HISTORY')
})

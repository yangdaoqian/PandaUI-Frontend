import defineToolbarItem from './defineToolbarItem'

function execute ({ drawer }) {
  drawer.toggle('MATERIAL')
}

export default defineToolbarItem({
  id: 'materials',
  kind: 'drawer',
  drawer: 'MATERIAL',
  icon: 'palette',
  tooltip: 'Materials',
  execute
})

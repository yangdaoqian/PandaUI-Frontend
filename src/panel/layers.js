import defineToolbarItem from './defineToolbarItem'

function execute ({ drawer }) {
  drawer.toggle('LAYER')
}

export default defineToolbarItem({
  id: 'layers',
  kind: 'drawer',
  drawer: 'LAYER',
  icon: 'layers',
  tooltip: 'Layers',
  execute
})

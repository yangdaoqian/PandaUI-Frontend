import defineToolbarItem from './defineToolbarItem'

function execute ({ drawer }) {
  drawer.toggle('EDITOR')
}

export default defineToolbarItem({
  id: 'editor-options',
  kind: 'drawer',
  drawer: 'EDITOR',
  icon: 'tune',
  tooltip: 'Editor Options',
  execute
})

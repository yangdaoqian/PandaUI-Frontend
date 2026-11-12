import defineToolbarItem from './defineToolbarItem'

function execute ({ drawer }) {
  drawer.toggle('PLUGINS')
}

export default defineToolbarItem({
  id: 'node-plugins',
  kind: 'drawer',
  drawer: 'PLUGINS',
  icon: 'extension',
  tooltip: 'Node plugins',
  execute
})

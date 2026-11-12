import defineToolbarItem from './defineToolbarItem'

function execute ({ drawer }) {
  drawer.toggle('FILE')
}

export default defineToolbarItem({
  id: 'files',
  kind: 'drawer',
  drawer: 'FILE',
  icon: 'folder',
  tooltip: 'Files',
  execute
})

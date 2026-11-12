import defineToolbarItem from './defineToolbarItem'

function execute ({ drawer, refreshCameraSettings }) {
  const opening = !drawer.isVisible('CAMERA')
  drawer.toggle('CAMERA')
  if (opening) refreshCameraSettings()
}

export default defineToolbarItem({
  id: 'camera-settings',
  kind: 'drawer',
  drawer: 'CAMERA',
  icon: 'photo_camera',
  tooltip: 'Camera settings',
  execute
})

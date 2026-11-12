const fs = require('fs')
const path = require('path')
const vm = require('vm')

module.exports = function loadEditorKernel (context) {
  const appearance = path.join(__dirname, '../public/editor/src/PandaUI/NodeAppearance.js')
  vm.runInContext(fs.readFileSync(appearance, 'utf8'), context, { filename: appearance })
  for (const file of ['Parameters/Param.js', 'Document/DocumentEventBus.js', 'Document/CommandHistory.js', 'Document/DependencyGraph.js', 'Document/SolutionScheduler.js', 'Document/GraphDocument.js', 'Objects/GraphGroup.js', 'Document/GraphOperations.js']) {
    const filename = path.join(__dirname, '../public/editor/src/Kernel', file)
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename })
  }
}

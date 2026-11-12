// Three r120's VRML grammar uses Chevrotain source-code introspection. Both
// token identifier mangling and grammar-body rewrites can break its RULE scan.
// Isolate only this loader; keep Three, Chevrotain, and every other asset minified.
const grammarChunk = 'scene-file-vrml-grammar'
const grammarAsset = /(?:^|[/\\])scene-file-vrml-grammar(?:\.[^/\\]+)?\.js(?:\?.*)?$/

module.exports = function configureSceneFileWebpack (config) {
  const optimization = config.optimization || (config.optimization = {})
  const splitChunks = optimization.splitChunks || (optimization.splitChunks = {})
  const cacheGroups = splitChunks.cacheGroups || (splitChunks.cacheGroups = {})
  cacheGroups.sceneFileVRMLGrammar = {
    test: /[/\\]three[/\\]examples[/\\]jsm[/\\]loaders[/\\]VRMLLoader\.js$/,
    name: grammarChunk,
    filename: 'js/scene-file-vrml-grammar.[contenthash:8].js',
    chunks: 'all',
    priority: 1000,
    enforce: true
  }
  if (optimization.minimize === false || config.mode === 'development') return
  // Quasar supplies a TerserPlugin instance. Plain webpack configs use its
  // implicit/default minimizer; expand that default so the same test applies.
  const minimizers = optimization.minimizer || ['...']
  optimization.minimizer = minimizers.map(minimizer => {
    if (minimizer === '...') {
      const TerserPlugin = require('terser-webpack-plugin')
      return new TerserPlugin({ exclude: grammarAsset })
    }
    if (minimizer?.constructor?.name === 'TerserPlugin') {
      const exclude = minimizer.options.exclude
      minimizer.options.exclude = exclude ? [...(Array.isArray(exclude) ? exclude : [exclude]), grammarAsset] : grammarAsset
    }
    return minimizer
  })
}

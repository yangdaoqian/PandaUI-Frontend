// TreePacker & TreeUnpacker —— 原生节点：在前端值 和 GH datatree 结构之间互转
// 注册类型:
//   "pandaui/tree_packer"   —— 打包: value / array -> {path:[], datas:[]}
//   "pandaui/tree_unpacker" —— 拆包: {path:[], datas:[]} -> 扁平数组
(function(global) {
  var PandaUI = global.PandaUI;
  var DataTree = global.PandaUIKernel && global.PandaUIKernel.DataTree;
  if (typeof DataTree !== 'function') throw new Error('PandaUIKernel.DataTree is not loaded.');

  // ---------- 核心工具（与 pandaui-plugins.js 保持一致） ----------

  // 任意输入 -> {path:[], datas:[]}
  function toTreeData(value) {
    return DataTree.from(value).toLegacy();
  }

  // treeData -> 扁平 list
  function toList(treeData) {
    if (treeData == null) return [];
    return DataTree.from(treeData).values();
  }

  // ---------- TreePacker ----------

  function TreePacker() {
    this.addInput('in', '');
    this.addOutput('tree', 'object');   // GH treeData: {path:[], datas:[]}
    this.addOutput('list', 'array');    // 同步的 datas 数组
    this.size = [160, 60];
  }

  TreePacker.title = 'Tree Pack';
  TreePacker.desc = 'Pack a value or array into a GH data tree {path, datas}.';
  TreePacker.prototype.onExecute = function() {
    var v = this.getInputData(0);
    if (v === undefined || v === null) return;
    var tree = toTreeData(v);
    this.setOutputData(0, tree);
    this.setOutputData(1, tree.datas.slice());
  };

  // ---------- TreeUnpacker ----------

  function TreeUnpacker() {
    this.addInput('tree', 'object');   // GH treeData: {path:[], datas:[]}
    this.addOutput('list', 'array');   // datas 数组
    this.addOutput('first', '');       // datas[0]，方便单值场景
    this.size = [160, 60];
  }

  TreeUnpacker.title = 'Tree Unpack';
  TreeUnpacker.desc = 'Unpack a GH data tree {path, datas} into a flat array or its first value.';
  TreeUnpacker.prototype.onExecute = function() {
    var v = this.getInputData(0);
    if (v === undefined || v === null) return;

    // 上游是 GH 节点的 _isDualData 对象 -> 取 treeData
    if (v._isDualData && v.display && v.display.treeData) v = v.display.treeData;

    var list = toList(v);
    this.setOutputData(0, list);
    this.setOutputData(1, list.length > 0 ? list[0] : undefined);
  };

  // ---------- 注册 ----------

  PandaUI.registerNode('pandaui/tree_packer', TreePacker);
  PandaUI.registerNode('pandaui/tree_unpacker', TreeUnpacker);
})(this);

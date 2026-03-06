// merge-utils.js — 三路合并算法

/**
 * 生成节点唯一标识 key
 */
function nodeKey(node) {
  if (node.url) {
    return 'b:' + node.title + '|' + node.url;
  }
  return 'f:' + node.title;
}

/**
 * 构建 key -> node 映射表
 * 处理重复 key：同名书签/文件夹追加序号
 */
function buildMap(children) {
  const map = new Map();
  const counts = new Map();

  for (const child of children || []) {
    let key = nodeKey(child);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    if (count > 1) {
      key += '#' + count;
    }
    map.set(key, child);
  }
  return map;
}

/**
 * 构建有序 key 列表（保留原始顺序信息）
 */
function buildOrderedKeys(children) {
  const keys = [];
  const counts = new Map();

  for (const child of children || []) {
    let key = nodeKey(child);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    if (count > 1) {
      key += '#' + count;
    }
    keys.push(key);
  }
  return keys;
}

/**
 * 三路合并子节点列表
 * @param {Array} localChildren  本地子节点
 * @param {Array} cloudChildren  云端子节点
 * @param {Array} baseChildren   基线子节点
 * @returns {Array} 合并后的子节点列表
 */
export function mergeChildren(localChildren, cloudChildren, baseChildren) {
  const localMap = buildMap(localChildren);
  const cloudMap = buildMap(cloudChildren);
  const baseMap = buildMap(baseChildren);

  const localKeys = buildOrderedKeys(localChildren);
  const cloudKeys = buildOrderedKeys(cloudChildren);

  const result = [];
  const processed = new Set();

  // 第一遍：按本地顺序处理
  for (const key of localKeys) {
    processed.add(key);
    const inLocal = localMap.has(key);
    const inCloud = cloudMap.has(key);
    const inBase = baseMap.has(key);

    if (inBase && !inCloud) {
      // 云端删除了这个节点 → 删除（删除优先）
      continue;
    }

    const localNode = localMap.get(key);
    const cloudNode = cloudMap.get(key);

    if (inCloud && isFolder(localNode) && isFolder(cloudNode)) {
      // 两端都有且为文件夹 → 递归合并
      const baseNode = baseMap.get(key);
      result.push({
        title: localNode.title,
        children: mergeChildren(
          localNode.children || [],
          cloudNode.children || [],
          (baseNode && baseNode.children) || []
        ),
      });
    } else {
      // 保留本地版本
      result.push(localNode);
    }
  }

  // 第二遍：处理仅在云端存在的新节点（追加到末尾）
  for (const key of cloudKeys) {
    if (processed.has(key)) continue;
    processed.add(key);

    const inBase = baseMap.has(key);
    const inLocal = localMap.has(key);

    if (inBase && !inLocal) {
      // 本地删除了 → 删除（删除优先）
      continue;
    }

    if (!inBase && !inLocal) {
      // 云端新增 → 加入
      result.push(cloudMap.get(key));
    }
  }

  return result;
}

/**
 * 判断节点是否为文件夹
 */
function isFolder(node) {
  return node && !node.url && Array.isArray(node.children);
}

/**
 * 三路合并完整书签树
 */
export function threeWayMerge(localTree, cloudTree, baseTree) {
  const merged = {
    version: 1,
    timestamp: Date.now(),
    roots: {},
  };

  // 对每个根文件夹（bar, other）分别合并
  const rootKeys = new Set([
    ...Object.keys(localTree.roots || {}),
    ...Object.keys(cloudTree.roots || {}),
  ]);

  for (const key of rootKeys) {
    const localRoot = (localTree.roots && localTree.roots[key]) || { children: [] };
    const cloudRoot = (cloudTree.roots && cloudTree.roots[key]) || { children: [] };
    const baseRoot = (baseTree && baseTree.roots && baseTree.roots[key]) || { children: [] };

    merged.roots[key] = {
      children: mergeChildren(
        localRoot.children || [],
        cloudRoot.children || [],
        baseRoot.children || []
      ),
    };
  }

  return merged;
}

/**
 * 无基线时的联合合并（取并集，避免数据丢失）
 */
export function mergeWithoutBase(localTree, cloudTree) {
  const merged = {
    version: 1,
    timestamp: Date.now(),
    roots: {},
  };

  const rootKeys = new Set([
    ...Object.keys(localTree.roots || {}),
    ...Object.keys(cloudTree.roots || {}),
  ]);

  for (const key of rootKeys) {
    const localRoot = (localTree.roots && localTree.roots[key]) || { children: [] };
    const cloudRoot = (cloudTree.roots && cloudTree.roots[key]) || { children: [] };

    merged.roots[key] = {
      children: unionChildren(localRoot.children || [], cloudRoot.children || []),
    };
  }

  return merged;
}

/**
 * 联合合并子节点（去重取并集）
 */
function unionChildren(localChildren, cloudChildren) {
  const localMap = buildMap(localChildren);
  const cloudMap = buildMap(cloudChildren);
  const localKeys = buildOrderedKeys(localChildren);
  const cloudKeys = buildOrderedKeys(cloudChildren);

  const result = [];
  const processed = new Set();

  // 先按本地顺序
  for (const key of localKeys) {
    processed.add(key);
    const localNode = localMap.get(key);
    const cloudNode = cloudMap.get(key);

    if (cloudNode && isFolder(localNode) && isFolder(cloudNode)) {
      result.push({
        title: localNode.title,
        children: unionChildren(
          localNode.children || [],
          cloudNode.children || []
        ),
      });
    } else {
      result.push(localNode);
    }
  }

  // 追加仅云端有的
  for (const key of cloudKeys) {
    if (!processed.has(key)) {
      result.push(cloudMap.get(key));
    }
  }

  return result;
}

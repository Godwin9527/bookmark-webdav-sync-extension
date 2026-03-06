// bookmark-manager.js — Chrome 书签 API 封装

/**
 * 读取完整书签树，转为可移植 JSON 格式
 */
export async function readTree() {
  const [root] = await chrome.bookmarks.getTree();
  const roots = {};

  for (const child of root.children) {
    if (child.id === '1') {
      roots.bar = { children: child.children.map(serializeNode) };
    } else if (child.id === '2') {
      roots.other = { children: child.children.map(serializeNode) };
    }
  }

  return {
    version: 1,
    timestamp: Date.now(),
    roots,
  };
}

/**
 * 清除"书签栏"和"其他书签"下的所有子项
 * 根文件夹（id=1, id=2）本身不可删除
 */
export async function clearAll() {
  const [root] = await chrome.bookmarks.getTree();

  for (const folder of root.children) {
    if (folder.id === '1' || folder.id === '2') {
      // 倒序删除避免索引偏移
      const children = [...folder.children].reverse();
      for (const child of children) {
        try {
          if (child.children) {
            await chrome.bookmarks.removeTree(child.id);
          } else {
            await chrome.bookmarks.remove(child.id);
          }
        } catch (err) {
          console.warn('删除书签失败:', child.title, err);
        }
      }
    }
  }
}

/**
 * 写入完整书签树（先清除再重建）
 */
export async function writeTree(treeData) {
  if (!treeData || !treeData.roots) {
    throw new Error('无效的书签数据');
  }

  // 先获取根文件夹 ID 映射
  const [root] = await chrome.bookmarks.getTree();
  const rootMap = {};
  for (const child of root.children) {
    if (child.id === '1') rootMap.bar = child.id;
    if (child.id === '2') rootMap.other = child.id;
  }

  // 清除所有现有书签
  await clearAll();

  // 重建书签树
  for (const [key, folder] of Object.entries(treeData.roots)) {
    const parentId = rootMap[key];
    if (!parentId || !folder.children) continue;

    for (let i = 0; i < folder.children.length; i++) {
      await createNode(parentId, folder.children[i], i);
    }
  }
}

/**
 * 递归序列化书签节点为可移植格式
 */
function serializeNode(node) {
  if (node.url) {
    // 书签
    return { title: node.title || '', url: node.url };
  }
  // 文件夹
  return {
    title: node.title || '',
    children: (node.children || []).map(serializeNode),
  };
}

/**
 * 递归创建书签节点
 */
async function createNode(parentId, nodeData, index) {
  if (nodeData.url) {
    // 创建书签
    await chrome.bookmarks.create({
      parentId,
      index,
      title: nodeData.title || '',
      url: nodeData.url,
    });
  } else {
    // 创建文件夹，然后递归创建子节点
    const folder = await chrome.bookmarks.create({
      parentId,
      index,
      title: nodeData.title || '',
    });

    if (nodeData.children) {
      for (let i = 0; i < nodeData.children.length; i++) {
        await createNode(folder.id, nodeData.children[i], i);
      }
    }
  }
}

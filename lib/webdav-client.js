// webdav-client.js — 纯 JS WebDAV 客户端

export class WebDAVClient {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.username = username;
    this.password = password;
  }

  _authHeader() {
    return 'Basic ' + btoa(this.username + ':' + this.password);
  }

  _url(path) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    return this.baseUrl + cleanPath;
  }

  async _fetch(method, path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(this._url(path), {
        method,
        headers: {
          Authorization: this._authHeader(),
          ...options.headers,
        },
        body: options.body,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 测试连接并确保基础目录存在
   */
  async testConnection() {
    try {
      const response = await this._fetch('PROPFIND', '/', {
        headers: { Depth: '0' },
      });
      if (response.status === 401) {
        return { ok: false, message: '认证失败：用户名或密码错误' };
      }
      if (response.status === 404) {
        return { ok: false, message: '路径不存在' };
      }
      if (response.ok || response.status === 207) {
        return { ok: true, message: '连接成功' };
      }
      return { ok: false, message: `服务器返回 ${response.status}` };
    } catch (err) {
      if (err.name === 'AbortError') {
        return { ok: false, message: '连接超时' };
      }
      return { ok: false, message: '网络错误：' + err.message };
    }
  }

  /**
   * 确保集合（目录）存在，不存在则创建
   */
  async ensureCollection(path) {
    // 先检查是否存在
    try {
      const check = await this._fetch('PROPFIND', path, {
        headers: { Depth: '0' },
      });
      if (check.ok || check.status === 207) {
        return; // 已存在
      }
    } catch {
      // 不存在，继续创建
    }

    // 逐级创建目录
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      const res = await this._fetch('MKCOL', current + '/');
      // 201 创建成功，405 已存在，都算正常
      if (res.status !== 201 && res.status !== 405 && !res.ok) {
        // 尝试读取响应体以获取更多信息
        const body = await res.text().catch(() => '');
        throw new Error(`创建目录 ${current} 失败: ${res.status} ${body}`);
      }
    }
  }

  /**
   * 获取资源信息（是否存在、最后修改时间）
   */
  async resourceInfo(path) {
    try {
      const response = await this._fetch('PROPFIND', path, {
        headers: { Depth: '0' },
      });

      if (response.status === 404) {
        return { exists: false, lastModified: null, etag: null };
      }

      if (!response.ok && response.status !== 207) {
        throw new Error(`PROPFIND 失败: ${response.status}`);
      }

      const xml = await response.text();
      const lastModified = this._extractFromXml(xml, 'getlastmodified');
      const etag = this._extractFromXml(xml, 'getetag');

      return {
        exists: true,
        lastModified: lastModified ? new Date(lastModified).getTime() : null,
        etag,
      };
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('请求超时');
      throw err;
    }
  }

  /**
   * 下载资源（JSON）
   */
  async get(path) {
    const response = await this._fetch('GET', path);

    if (response.status === 404) {
      return null; // 资源不存在
    }

    if (!response.ok) {
      throw new Error(`GET 失败: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * 上传资源（JSON）
   */
  async put(path, data) {
    const response = await this._fetch('PUT', path, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(data, null, 2),
    });

    if (!response.ok && response.status !== 201 && response.status !== 204) {
      throw new Error(`PUT 失败: ${response.status}`);
    }
  }

  /**
   * 从 WebDAV XML 响应中提取指定属性值
   */
  _extractFromXml(xml, tagName) {
    // 处理带命名空间前缀的标签，如 D:getlastmodified, d:getlastmodified
    const patterns = [
      new RegExp(`<(?:\\w+:)?${tagName}[^>]*>([^<]*)<`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = xml.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }
}

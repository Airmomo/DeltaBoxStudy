import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
}));

export function injectDemo(html) {
  return html.replace('</head>', '<link rel="stylesheet" href="/study/demo.css"></head>')
    .replace('<script src="data/data.js">', '<script src="/study/bridge.js"></script>\n<script src="data/data.js">')
    .replace('</body>', '<script src="/study/demo.js"></script></body>');
}

export function createStudyServer(root = projectRoot) {
  const absoluteRoot = path.resolve(root);
  return http.createServer(async (request, response) => {
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      'Referrer-Policy': 'no-referrer' };
    const fail = (status, text) => { response.writeHead(status, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }); response.end(text); };
    if (!['GET', 'HEAD'].includes(request.method)) return fail(405, '仅提供学习项目的只读访问');
    try {
      // Inspect the raw path before URL parsing can normalize dot segments.
      const encoded = request.url.split('?')[0];
      const decoded = decodeURIComponent(encoded);
      if (!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').includes('..')) return fail(403, '禁止访问项目之外的文件');
      const raw = decoded.startsWith('/source/');
      let relative = raw ? decoded.slice('/source/'.length) : decoded.slice(1);
      if (!relative) relative = 'index.html';
      if (!(relative.startsWith('renderer/') || relative.startsWith('study/') ||
          ['index.html', 'README.md', 'NOTICE.md', 'LICENSE', 'archive-manifest.json', 'package.json'].includes(relative))) return fail(404, '文件不在学习资源清单中');
      const target = path.resolve(absoluteRoot, relative);
      const resolved = await realpath(target);
      const rootReal = await realpath(absoluteRoot);
      const relation = path.relative(rootReal, resolved);
      if (relation.startsWith('..') || path.isAbsolute(relation)) return fail(403, '禁止跟随项目外的链接');
      if (!(await stat(resolved)).isFile()) return fail(404, '文件不存在');
      let content = await readFile(resolved);
      if (!raw && relative === 'renderer/overlay.html') content = Buffer.from(injectDemo(content.toString('utf-8')));
      const contentType = raw ? 'text/plain; charset=utf-8' : types.get(path.extname(relative)) || 'application/octet-stream';
      response.writeHead(200, { ...headers, 'Content-Type': contentType, 'Content-Length': content.length });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (error instanceof URIError) return fail(400, '无效路径');
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return fail(404, '该资源未包含在学习项目中');
      fail(500, '读取学习资源失败');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 43130);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1～65535 的整数');
  const server = createStudyServer();
  server.on('error', error => { console.error(`学习服务器启动失败：${error.code || error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`DeltaBoxStudy · 南神 · 1.3.0\n打开 http://127.0.0.1:${port}\n按 Ctrl+C 停止；仅监听本机，不访问生产服务。`));
}

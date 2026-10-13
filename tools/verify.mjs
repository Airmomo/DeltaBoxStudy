import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function verifyArchive(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const manifest = JSON.parse(await readFile(path.join(root, 'archive-manifest.json'), 'utf-8'));
  if (manifest.sourceVersion !== '1.3.0' || manifest.assetCount !== manifest.files.length) throw new Error('学习项目版本或清单数量错误');
  const expected = new Set();
  for (const item of manifest.files) {
    if (!item.path.startsWith('renderer/') || item.path.split('/').includes('..') || item.path.includes('\\')) throw new Error('清单路径无效');
    const data = await readFile(path.join(root, item.path));
    if (data.length !== item.bytes || crypto.createHash('sha256').update(data).digest('hex') !== item.sha256) throw new Error(`基线文件已改变：${item.path}`);
    expected.add(item.path);
  }
  async function scan(directory, prefix) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`资源目录不允许符号链接：${relative}`);
      if (entry.isDirectory()) await scan(path.join(directory, entry.name), relative);
      else if (!expected.has(relative)) throw new Error(`资源目录多出文件：${relative}`);
    }
  }
  await scan(path.join(root, 'renderer'), 'renderer');
  const context = { window: {} };
  vm.runInNewContext(await readFile(path.join(root, 'renderer/data/data.js'), 'utf-8'), context, { timeout: 2000 });
  const maps = context.window.__DATA__.maps;
  const pointRecords = Object.values(maps).reduce((sum, map) => sum + Object.values(map.Points).reduce((n, points) => n + points.length, 0), 0);
  const about = JSON.parse(await readFile(path.join(root, 'renderer/data/about.json'), 'utf-8'));
  if (about.version !== '1.3.0' || about.author.name !== '南神') throw new Error('版本或原作者不一致');
  return { version: manifest.sourceVersion, verifiedFiles: manifest.files.length, mapCount: Object.keys(maps).length, pointRecords, author: about.author.name };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await verifyArchive(), null, 2));
}

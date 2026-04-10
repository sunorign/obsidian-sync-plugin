import fs from 'fs';
import path from 'path';

const pluginDir = path.join(process.cwd(), 'build', 'obsidian-github-sync');
const filesToCopy = ['manifest.json', 'styles.css'];

// 确保插件目录存在
if (!fs.existsSync(pluginDir)) {
  fs.mkdirSync(pluginDir, { recursive: true });
  console.log(`Created plugin directory: ${pluginDir}`);
}

// 复制文件
filesToCopy.forEach(file => {
  const sourcePath = path.join(process.cwd(), file);
  const destPath = path.join(pluginDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied: ${file} -> build/obsidian-github-sync/`);
  } else {
    console.warn(`Warning: File not found: ${file}`);
  }
});

console.log('All files copied successfully!');
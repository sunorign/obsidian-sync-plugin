import fs from 'fs';
import path from 'path';

const buildDir = path.join(process.cwd(), 'build');
const filesToCopy = ['manifest.json', 'styles.css'];

// 确保 build 目录存在
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
  console.log(`Created build directory: ${buildDir}`);
}

// 复制文件
filesToCopy.forEach(file => {
  const sourcePath = path.join(process.cwd(), file);
  const destPath = path.join(buildDir, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`Copied: ${file} -> build/`);
  } else {
    console.warn(`Warning: File not found: ${file}`);
  }
});

console.log('All files copied successfully!');
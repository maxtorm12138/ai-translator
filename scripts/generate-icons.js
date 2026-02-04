#!/usr/bin/env node
/**
 * 图标生成脚本
 * 将SVG转换为不同尺寸的PNG图标
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 图标尺寸配置
const sizes = [16, 32, 48, 128];
const sourceSvg = path.join(__dirname, '../public/icons/icon-source.svg');
const outputDir = path.join(__dirname, '../public/icons');

// 简单的SVG to PNG转换（使用Data URL + Canvas方式需要浏览器环境）
// 这里我们创建一个简单的Node.js脚本，使用svg2img或其他库
// 但为了简化依赖，我们先生成SVG，然后提示用户使用工具转换

console.log('🎨 AI Translator 图标生成脚本');
console.log('================================');
console.log('');
console.log('源文件:', sourceSvg);
console.log('输出目录:', outputDir);
console.log('');
console.log('需要生成的尺寸:', sizes.join(', '), 'px');
console.log('');
console.log('提示: 请使用以下方法之一生成PNG:');
console.log('');
console.log('方法1 - 使用 npx svgexport:');
console.log('  npx svgexport public/icons/icon-source.svg public/icons/icon16.png 16:16');
console.log('  npx svgexport public/icons/icon-source.svg public/icons/icon32.png 32:32');
console.log('  npx svgexport public/icons/icon-source.svg public/icons/icon48.png 48:48');
console.log('  npx svgexport public/icons/icon-source.svg public/icons/icon128.png 128:128');
console.log('');
console.log('方法2 - 使用 Inkscape:');
console.log('  inkscape public/icons/icon-source.svg --export-filename=public/icons/icon16.png -w 16 -h 16');
console.log('');
console.log('方法3 - 在线转换工具:');
console.log('  访问 https://convertio.co/zh/svg-png/ 或类似网站');
console.log('');

// 验证源文件存在
if (!fs.existsSync(sourceSvg)) {
  console.error('❌ 错误: 源SVG文件不存在!');
  process.exit(1);
}

console.log('✅ 源SVG文件已找到');
console.log('✅ 请使用上述命令生成PNG图标');

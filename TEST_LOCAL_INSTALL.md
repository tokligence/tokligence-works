# 本地测试安装指南

## 步骤1: 打包

```bash
cd /Users/tonyseah/tl/tokligence-works

# 确保已编译
npm run build

# 打包
npm pack

# 生成: tokligence-works-0.1.0.tgz
```

## 步骤2: 全局安装测试

```bash
# 安装
npm install -g ./tokligence-works-0.1.0.tgz

# 验证
tokligence --version
which tokligence
```

## 步骤3: 在新项目中测试

```bash
# 创建测试项目
mkdir ~/test-tokligence-project
cd ~/test-tokligence-project

# 测试命令 (当前还未实现，会看到现有的CLI)
tokligence --help
```

## 步骤4: 清理

```bash
# 卸载
npm uninstall -g tokligence-works

# 删除测试项目
rm -rf ~/test-tokligence-project

# 删除打包文件
rm /Users/tonyseah/tl/tokligence-works/tokligence-works-0.1.0.tgz
```

## 当前状态

✅ 已修复 shebang 问题
✅ 可以正常安装
⚠️  CLI命令需要实现 (init, start等)

## 修复内容

**问题**:
```
/opt/homebrew/bin/tokligence: line 1: use strict: command not found
```

**原因**: bin文件缺少 `#!/usr/bin/env node`

**修复**: 在 `src/index.ts` 第一行添加了 shebang

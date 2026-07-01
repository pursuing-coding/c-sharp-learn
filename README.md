<div align="center">

# C# 闯关学习平台

**一个面向零基础小白的 C# 闯关式学习平台 —— 浏览器内直接运行 C#，无需安装任何环境**

`34 关` · `6 大阶段` · `13 章` · `从 Hello World 到学生管理系统`

</div>

<br>

<p align="center">
  <samp>边读 · 边写 · 边运行 —— 每一关都有即时反馈</samp>
</p>

---

## ✨ 特性一览

| 特性 | 说明 |
| :-- | :-- |
| 🎯 **闯关式学习** | 34 关 · 6 阶段 · 13 章，循序渐进，从零基础到能独立编写小型控制台项目 |
| 💻 **浏览器内运行 C#** | 内置轻量 C#→JS 模拟执行器，**无需安装 .NET SDK**，打开即用 |
| 📚 **分阶段课程** | 入门基础 → 控制流 → 数据结构 → 方法与面向对象 → 进阶特性 → 实战项目 |
| 🌗 **暗色 / 亮色双主题** | 自动记忆偏好，0.3s 平滑过渡 |
| 🎌 **专注模式** (`F11`) | 全屏编辑器，虚化背景，`Esc` 退出，沉浸式敲代码 |
| 📖 **参考答案侧栏** | 从编辑器右侧滑出，不遮挡代码，一键复制 |
| ⌨ **`Console.ReadLine` 支持** | 运行前弹出输入区，可写交互式入门关卡 |
| ⌨ **键盘快捷键** | `Ctrl+Enter` 运行 · `Alt+←/→` 切换关卡 · `Tab` 缩进 / 自动配对括号 |
| 💾 **本地进度存储** | `localStorage` 自动保存进度与代码历史，无需登录 |
| 🛡 **防作弊机制** | 查看参考答案的关卡仍可解锁，但不再奖励 ⭐ |
| 🌐 **纯静态部署** | 零依赖，可直接部署到 GitHub Pages |

---

## 🚀 快速开始

纯静态站点，直接用浏览器打开 `index.html` 即可体验。若需本地服务器：

```bash
# Python
python -m http.server 8080

# 或 Node.js
npx serve
```

浏览器打开 `http://localhost:8080` 。

---

## 📦 部署到 GitHub Pages

1. Fork 或 push 本仓库到 GitHub
2. 进入仓库 **Settings → Pages**
3. **Source** 选择 `main` 分支，目录选 `/ (root)`
4. 等待几分钟，访问：

```
https://<你的用户名>.github.io/<仓库名>/
```

> 仓库已附带 `.nojekyll`，确保静态资源不被 Jekyll 处理。

---

## 📖 课程结构

| 阶段 | 章节 | 关卡数 | 核心内容 |
| :-- | :-- | :-: | :-- |
| 🟢 入门基础 | 第 1–3 章 | 9 | Hello World、变量与数据类型、运算符 |
| 🔵 控制流 | 第 4–5 章 | 7 | if / switch / 三元、for / while / break |
| 🟣 数据结构 | 第 6–7 章 | 6 | 数组、字符串方法、Split / Join |
| 🟠 方法与面向对象 | 第 8–11 章 | 8 | 方法、类、继承、virtual / override、接口 |
| 🟡 进阶特性 | 第 12 章 | 1 | `List<T>` 动态列表 |
| 🔴 实战项目 | 第 13 章 | 3 | 计算器、猜数字、学生管理系统 |

> 共 **34 关**，全部经内置模拟执行器验证通过，每一关的参考答案都能在本平台正确运行。

---

## 🛠 技术栈

- **原生 HTML / CSS / JavaScript**，无任何第三方依赖
- 自研 **C#→JS 轻量模拟执行器**（`js/runner.js`），支持：
  - 基本类型 / 变量 / 常量 / `var`
  - `if` / `switch` / `for` / `while` / `foreach` / `break` / `continue`
  - 数组、`List<T>`、字符串方法
  - 类、字段、构造函数、方法重载、递归
  - 继承、`virtual` / `override` 多态、接口
  - 字符串插值 `$"...{x}..."`
  - `Console.WriteLine` / `Write` / `ReadLine`
- `localStorage` 进度存储

### 项目结构

```
c-sharp-learn/
├── index.html              # 页面骨架
├── styles/
│   └── main.css            # 全部样式（双主题 / 响应式）
├── js/
│   ├── chapters-data.js    # 课程内容（34 关数据）
│   ├── runner.js           # C#→JS 模拟执行器
│   ├── storage.js          # 本地进度存储
│   └── app.js              # 应用主逻辑（UI / 交互 / 专注模式）
├── .nojekyll               # GitHub Pages 直发标记
└── README.md
```

---

## ⚠️ 运行器能力边界

内置执行器为**正则翻译式模拟器**，并非真正的 .NET 运行时，支持的语法子集有限（详见 `js/runner.js`）。课程内容已锚定在该子集内，确保每一关都能正确运行。

如需学习 **LINQ、async/await、泛型方法、委托/事件** 等进阶特性，建议配合本地安装 [.NET SDK](https://dotnet.microsoft.com/)。

---

## 📄 License

[MIT](LICENSE) —— 自由学习、修改、分享。

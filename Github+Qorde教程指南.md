# 从零开始：GitHub + Qoder 开发实战教程

> 本教程以一个完整案例带你体验：**注册 GitHub → 下载并安装 Qoder → 使用 Qoder 开发项目 → 提交到 GitHub** 的全流程。
>
> 即使你没有任何编程基础，按照步骤操作也可以完成一个可运行的项目。

---

## 目录

1. [案例项目简介](#案例项目简介)
2. [第一步：注册 GitHub 账号](#第一步注册-github-账号)
3. [第二步：下载安装 Qoder](#第二步下载安装-qoder)
4. [第三步：在 Qoder 中创建项目](#第三步在-qoder-中创建项目)
5. [第四步：在 GitHub 上创建远程仓库](#第四步在-github-上创建远程仓库)
6. [第五步：用 Qoder 将项目提交到 GitHub](#第五步用-qoder-将项目提交到-github)

---

## 案例项目简介

我们将开发一个“个人待办清单（Todo List）”网页应用，功能包括：

- 添加待办事项
- 标记完成 / 删除事项
- 数据本地保存（刷新页面后数据不丢失）

最终效果是一个可以在浏览器中打开使用的单页应用，代码将托管在 GitHub 上。

---

## 第一步：注册 GitHub 账号

### 1.1 打开注册页面

打开浏览器，访问：[GitHub 注册页](https://github.com/signup)

### 1.2 填写注册信息

| 字段 | 填写内容 | 说明 |
| --- | --- | --- |
| Email | 你的邮箱地址 | 推荐使用常用邮箱 |
| Password | 设置密码 | 至少 8 位，建议包含数字和字母 |
| Username | 设置用户名 | 例如 `zhangsan2024`，后续会出现在仓库地址中 |

填写完成后点击 Continue，并完成邮箱验证（输入邮箱收到的验证码）。

### 1.3 选择计划

- 注册过程中会询问你选择 Free（免费）还是付费计划
- 选择 Free 即可，个人开发完全够用

### 1.4 注册完成

注册成功后会进入 GitHub 首页（https://github.com），右上角可以看到你的头像图标。

> 提示：记住你的用户名，后面创建仓库和推送代码时会用到。

---

## 第二步：下载安装 Qoder

### 2.1 下载 Qoder IDE

打开浏览器，访问：[Qoder 下载页](https://qoder.com/download)

页面会自动识别你的操作系统，点击下载按钮即可。

| 操作系统 | 下载文件 |
| --- | --- |
| Windows | `.exe` 安装包（推荐 User 版，无需管理员权限） |
| macOS | `.dmg` 安装包 |
| Linux | `.deb` / `.rpm` 包 |

### 2.2 安装 Qoder

#### Windows 用户

1. 双击下载的 `.exe` 安装包
2. 可自定义安装路径（建议放在非系统盘，如 `D:\Qoder`）
3. 勾选“创建桌面快捷方式”
4. 点击“安装”，等待完成

#### macOS 用户

1. 双击 `.dmg` 文件
2. 将 Qoder 图标拖入“应用程序”文件夹
3. 完成安装

### 2.3 启动并登录 Qoder

1. 双击桌面 Qoder 图标启动
2. 首次启动会引导你完成初始配置（例如选择主题等）
3. 点击右上角用户图标 → 登录
4. 在弹出的网页中：
   - 可以使用 GitHub 账号一键登录（推荐，后续推送代码更方便）
   - 也可以使用邮箱注册 Qoder 账号
5. 登录成功后返回 Qoder IDE

> 提示：Qoder 个人版提供免费试用额度，包含 AI 智能编码功能。

---

## 第三步：在 Qoder 中创建项目

### 3.1 创建项目文件夹

在电脑上创建一个新文件夹，用于存放项目文件：

```text
桌面/
  └── my-todo-app/
```

### 3.2 用 Qoder 打开项目

1. 启动 Qoder IDE
2. 点击菜单：文件 → 打开文件夹
3. 选择刚才创建的 `my-todo-app` 文件夹
4. Qoder 会打开该项目（此时文件夹为空）

### 3.3 使用 Qoder AI 生成项目代码

这是 Qoder 最强大的功能——你只需要用自然语言描述需求，AI 就能帮助你编写代码。

#### 方法一：使用 Agent 模式（推荐）

1. 在 Qoder 右侧打开 AI 助手面板
2. 切换到 Agent 模式
3. 输入以下提示词：

```text
帮我创建一个个人待办清单（Todo List）网页应用，要求：
1. 使用纯 HTML + CSS + JavaScript，不需要任何框架
2. 所有代码写在一个 index.html 文件中（内联 CSS 和 JS）
3. 功能包括：
   - 输入框 + 添加按钮，可以添加待办事项
   - 每个事项前面有复选框，点击可标记为已完成（文字加删除线）
   - 每个事项右侧有删除按钮
   - 使用 localStorage 保存数据，刷新页面后数据不丢失
4. 界面要美观，使用现代简洁的设计风格
5. 支持回车键快速添加事项
```

4. 按回车发送，Qoder AI 会自动分析需求并生成代码
5. AI 会在项目中创建 `index.html` 文件

#### 方法二：手动创建文件（一般不用）

如果 AI 助手暂时不可用，你也可以手动创建：

1. 在 Qoder 左侧文件树中右键 → 新建文件
2. 输入文件名 `index.html`
3. 将下面的代码粘贴进去：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>我的待办清单</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            padding: 40px 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            padding: 32px;
            width: 100%;
            max-width: 500px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        h1 {
            text-align: center;
            color: #333;
            margin-bottom: 24px;
            font-size: 24px;
        }
        .input-area {
            display: flex;
            gap: 8px;
            margin-bottom: 24px;
        }
        .input-area input {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s;
        }
        .input-area input:focus { border-color: #667eea; }
        .input-area button {
            padding: 12px 20px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            cursor: pointer;
            transition: background 0.2s;
        }
        .input-area button:hover { background: #5a6fd6; }
        .todo-list { list-style: none; }
        .todo-item {
            display: flex;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid #f0f0f0;
            animation: slideIn 0.2s ease;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .todo-item input[type="checkbox"] {
            width: 20px;
            height: 20px;
            margin-right: 12px;
            cursor: pointer;
            accent-color: #667eea;
        }
        .todo-item span {
            flex: 1;
            font-size: 15px;
            color: #333;
            transition: all 0.2s;
        }
        .todo-item.done span {
            text-decoration: line-through;
            color: #aaa;
        }
        .todo-item .delete-btn {
            background: none;
            border: none;
            color: #e74c3c;
            font-size: 18px;
            cursor: pointer;
            padding: 4px 8px;
            border-radius: 4px;
            opacity: 0;
            transition: opacity 0.2s;
        }
        .todo-item:hover .delete-btn { opacity: 1; }
        .empty-msg {
            text-align: center;
            color: #aaa;
            padding: 32px 0;
            font-size: 14px;
        }
        .stats {
            text-align: center;
            color: #888;
            font-size: 13px;
            margin-top: 16px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📝 我的待办清单</h1>
        <div class="input-area">
            <input type="text" id="todoInput" placeholder="输入新的待办事项..." autofocus>
            <button onclick="addTodo()">添加</button>
        </div>
        <ul class="todo-list" id="todoList"></ul>
        <div class="stats" id="stats"></div>
    </div>

    <script>
        let todos = JSON.parse(localStorage.getItem('todos')) || [];

        const input = document.getElementById('todoInput');
        const list = document.getElementById('todoList');
        const stats = document.getElementById('stats');

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addTodo();
        });

        function addTodo() {
            const text = input.value.trim();
            if (!text) return;
            todos.push({ text, done: false });
            input.value = '';
            saveAndRender();
        }

        function toggleTodo(index) {
            todos[index].done = !todos[index].done;
            saveAndRender();
        }

        function deleteTodo(index) {
            todos.splice(index, 1);
            saveAndRender();
        }

        function saveAndRender() {
            localStorage.setItem('todos', JSON.stringify(todos));
            render();
        }

        function render() {
            list.innerHTML = '';
            if (todos.length === 0) {
                list.innerHTML = '<li class="empty-msg">暂无待办事项，添加一个吧 ✨</li>';
                stats.textContent = '';
                return;
            }
            todos.forEach((todo, index) => {
                const li = document.createElement('li');
                li.className = 'todo-item' + (todo.done ? ' done' : '');
                li.innerHTML = `
                    <input type="checkbox" ${todo.done ? 'checked' : ''} 
                           onchange="toggleTodo(${index})">
                    <span>${todo.text}</span>
                    <button class="delete-btn" onclick="deleteTodo(${index})">✕</button>
                `;
                list.appendChild(li);
            });
            const doneCount = todos.filter(t => t.done).length;
            stats.textContent = `共 ${todos.length} 项，已完成 ${doneCount} 项`;
        }

        render();
    </script>
</body>
</html>
```

### 3.4 预览项目效果

1. 在 Qoder 中打开 `index.html` 文件
2. 右键文件 → 在浏览器中打开（或用浏览器直接打开该文件）
3. 你应该能看到一个漂亮的待办清单界面，可以添加、完成、删除事项

---

## 第四步：在 GitHub 上创建远程仓库

### 4.1 创建新仓库

1. 登录 GitHub，点击右上角 `+` → `New repository`
2. 填写信息：

| 字段 | 填写内容 |
| --- | --- |
| Repository name | `my-todo-app` |
| Description | `我的个人待办清单网页应用`（可选） |
| 可见性 | 选择 Public |
| 初始化 | 不要勾选 “Add a README”、“.gitignore” 或 “license” |

3. 点击 Create repository

### 4.2 记录仓库地址

创建成功后，页面会显示仓库地址，格式为：

```text
https://github.com/你的用户名/my-todo-app.git
```

复制这个地址，后面推送代码时需要用到。

---

## 第五步：用 Qoder 将项目提交到 GitHub

### 5.1 在 Qoder 中初始化 Git 仓库

#### 方法一：使用 Qoder 内置终端

1. 在 Qoder 中按快捷键 `` Ctrl + ` ``（反引号）打开终端
2. 依次输入以下命令：

```bash
# 初始化 Git 仓库
git init

# 添加所有文件到暂存区
git add .

# 提交（引号内是本次提交的说明）
git commit -m "init: 创建待办清单应用"

# 设置主分支为 main
git branch -M main

# 添加 GitHub 远程仓库（替换为你的实际地址）
git remote add origin https://github.com/你的用户名/my-todo-app.git

# 推送到 GitHub
git push -u origin main
```

#### 方法二：使用 Qoder 源代码管理面板

1. 点击 Qoder 左侧栏的“源代码管理”图标（分叉形状）
2. 你会看到 `index.html` 文件显示在“更改”列表中
3. 在输入框中输入提交说明：`init: 创建待办清单应用`
4. 点击 ✓ 提交按钮
5. 点击 `...` → 推送，或点击“同步更改”按钮

---

## 结语

通过本教程，你已经完成了从 GitHub 注册、Qoder 安装、AI 编码、到项目托管的完整流程。现在你已经具备了最基础的“开发 + 提交 + 代码托管”能力。接下来，你可以继续扩展这个待办清单项目，例如：

- 添加分类标签
- 支持任务优先级
- 增加暗黑模式
- 做成真正的全栈应用

如果你愿意，我还可以继续为你补一篇“如何把这个项目升级为 Vue / React 版”的进阶教程。

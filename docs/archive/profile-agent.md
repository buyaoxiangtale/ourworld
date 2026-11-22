> 历史记录：本文保留当时的设计与验收结论。当前命令、目录和构建状态以仓库 README 为准。

# Profile 排版 Agent

## 当前接入情况

服务端已接入 Chat Completions 兼容协议，预设 DeepSeek Flash；包含异步队列、生成状态、结构化布局校验、一次修正、超时和错误处理。前端及原生端支持候选预览、应用到草稿和单独发布。生成不会直接覆盖公开主页，过期候选不能覆盖新草稿。

目前本机没有配置 `LLM_API_KEY`，因此真实 DeepSeek 请求尚未完成验收。已通过的模型协议测试使用本地受控 HTTP 服务，不代表外部模型调用成功。未配置时接口返回 `MODEL_NOT_CONFIGURED`，不会用静态模板冒充生成。

## 本机启用

在项目根目录 `.env` 填写密钥，保持以下配置：

```dotenv
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-flash
LLM_OUTPUT_MODE=json
LLM_API_KEY=在本机填写
```

然后运行：

```powershell
docker compose up -d --no-build --scale api=2 --force-recreate api worker gateway
```

登录后进入 Profile 的主页编辑，输入例如“照片放到最上面，介绍用紧凑样式，特长和服务城市各占半行，使用明亮的奶油白主题”。等待候选生成，预览后应用到草稿，再发布。密钥只在本机服务端使用，不需要发到聊天或填写在手机应用中。

## 能力范围

Agent 可以调整组件顺序、半宽/整宽、紧凑/展开、主题和强调色，使用当前账号已有的文本、图片与资源。它不修改认证与评分，不编造服务或评价，也不访问私聊和证件。新的经历文字和照片先由用户添加，再让 Agent 排版。

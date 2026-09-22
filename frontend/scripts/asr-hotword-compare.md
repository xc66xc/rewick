# Qwen Audio Streaming：第一阶段验证

本阶段接入 qwen-audio-3.1-asr-flash-streaming，复用现有 PCM16 / 16 kHz /
单声道采集和 run-task → task-started → 二进制音频 → finish-task → task-finished
生命周期。管理端测试连接与正式转写使用同一地址校验及启动协议。
不会自动切换已发布模型，不增加面试术语页面。

## 管理后台配置

- 模型 ID：qwen-audio-3.1-asr-flash-streaming
- 地址：供应商控制台给出的对应地域 WebSocket 地址，以 /api-ws/v1/inference 结尾。
  北京文档示例：wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference
- WorkspaceId 必须替换为真实业务空间 ID；API Key 与地域、空间匹配。
- 不使用 LiveTranslate 的 /realtime 地址，不附加 ?model=。
- 发布模型后执行“测试连接”；桌面重新读取平台服务并选择该语音模型，重新开始转写。
- 测试连接只发送半秒合成静音，验证任务生命周期，不代表识别准确率达标。

## 同一段录音对照

准备 10—30 秒测试 WAV，涵盖“虚拟量测 Agent”、普通中文、英文缩写及发音相似但不应替换的词。
音频必须是 PCM16、16000 Hz、单声道。脚本不读取麦克风，不自动转换音频。
如安装了 ffmpeg，可转换自己的录音：

```sh
ffmpeg -i input.m4a -ar 16000 -ac 1 -c:a pcm_s16le sample.wav
```

创建 hotwords.json：

```json
{"虚拟量测":3,"Agent":3}
```

从仓库根目录运行，API Key 通过环境变量提供（不要放进源码或提交版本库）：

```sh
export ASR_TEST_URL='wss://你的业务空间.cn-beijing.maas.aliyuncs.com/api-ws/v1/inference'
# 在当前终端安全设置 DASHSCOPE_API_KEY 后执行：
node frontend/scripts/asr-hotword-compare.mjs sample.wav hotwords.json comparison.json
```

脚本顺序运行新模型无热词、新模型有热词，按实时速度发送同一段音频，
保存最终文字、首字延迟、音频发送结束后的完成延迟及总耗时。
文件使用独占创建，已存在时拒绝覆盖；输出包含转写正文，请自行保管。
调用会产生供应商费用。建议用多个录音重复比较，不能以单次结果判断整体准确率。

可选：同时比较旧 LiveTranslate 原文识别，在运行前配置：

```sh
export ASR_BASELINE_URL='wss://你的业务空间.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=qwen3.8-livetranslate-flash-realtime'
# 若旧模型使用不同 Key，另设 ASR_BASELINE_KEY；否则复用 DASHSCOPE_API_KEY。
```

可选：验证发布后的平台转发链路，而非直连供应商：

```sh
export ASR_TEST_MODE=platform
export ASR_TEST_URL='wss://你的平台/api/v1/asr?serviceId=所选新语音服务ID'
# 配置 ASR_TEST_TOKEN 为当前桌面登录令牌，保持对应账号的面试计时已开始。
node frontend/scripts/asr-hotword-compare.mjs sample.wav hotwords.json platform-comparison.json
```

平台模式遵循原有鉴权、面试额度和用量计费，不绕过限制。
不要把令牌贴入报告。平台模式下基线如需直连，仍单独提供供应商 Key。

## 协议与范围

| 业务语义 | 现有字段 | 本次字段 | 接入影响 |
| --- | --- | --- | --- |
| 会话即时热词 | 无 | payload.parameters.vocabulary | 可选词语→整数权重对象；旧客户端不传时不变 |

平台第一阶段仅为此具体模型开放即时热词，最多 200 个，每词最多 80 个 UTF-16 码元，
词表 JSON 总大小不超过 4096 字节（预留 WebSocket 消息空间），权重 1—5；拒绝空词、首尾空白和控制字符。不开放权重 50 的超级热词。
这些是本次平台验证工具的限制，不是供应商上限。其他模型携带该字段显式报错，避免静默忽略。
用户不能通过客户端覆盖管理端选定的供应商或模型。

第二阶段现已增加面试准备中的专业术语编辑和资料提取。正式平台转写会自动加载本场面试绑定的术语；
仅 qwen-audio-3.1-asr-flash-streaming 注入热词，其他模型继续使用原协议。
脚本平台模式无热词组显式发送空 vocabulary，避免误用已保存术语。没有新增转写后 AI 纠错。

## 验证

- 后端：node scripts/backend.mjs test
- 对比工具：node --test frontend/scripts/asr-hotword-compare.test.mjs
- 待供应商配置和用户测试音频就绪后，执行真实三组对照，记录术语正确率和普通词误改率。
- 本地自动化不等于真实供应商识别效果验证。

官方依据（2026-09-22 核对）：
- https://help.aliyun.com/zh/model-studio/fun-asr-client-events
- https://help.aliyun.com/zh/model-studio/fun-asr-realtime-python-sdk

## 第二阶段使用方式

在新建或编辑面试准备中填写“专业术语”，每行一个或用逗号分隔。
“从所选资料提取”会调用平台默认回答模型生成候选词（会产生模型调用成本，不扣面试时长），
合并已有术语供检查后保存。提取读取本账号所选简历、岗位与参考资料，最多12000字符，
按所选资料均分预算，每份参考资料最多读取前12个片段；不是全量资料穷举。
资料选择变化后会提示重新提取，已有手动词保留。建议补充未被提取的专业词。

保存后下次开始平台转写使用该场面试的词表。常规与紧凑模式共享，
更换默认环境不会把另一场面试的术语混入正在进行的面试。
词表随账号云端保存，旧客户端未传该字段时保留已有词表，显式空数组用于清空。
自定义直连语音服务不在本次自动注入范围。

新增API：POST /api/v1/background/hotwords/extract
请求：{resumeId, targetId, referenceIds}，返回：{hotwords: string[]}。
环境保存新增可选 hotwords: string[]。提取不自动保存环境，不改变既有回答流程。

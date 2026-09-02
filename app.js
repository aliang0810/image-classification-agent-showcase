const STAGES = {
  entry: { label: "入口", color: "#63d6af", icon: "play" },
  input: { label: "输入准备", color: "#42d4e8", icon: "braces" },
  decision: { label: "条件判断", color: "#e6b763", icon: "split" },
  context: { label: "规则上下文", color: "#8eb0ff", icon: "database" },
  prompt: { label: "Prompt 组装", color: "#a569e8", icon: "file-text" },
  inference: { label: "模型推理", color: "#ff8ca1", icon: "sparkles" },
  result: { label: "结果整合", color: "#70d9c0", icon: "git-merge" },
  report: { label: "上报收尾", color: "#96a5bd", icon: "activity" },
};

const n = (id, name, stage, x, y, description, input, output, note = "") => ({
  id, name, stage, x, y, description, input, output, note,
});

const workflows = {
  main: {
    title: "T5_Photo_Copilot_Offline · 总控链路",
    subtitle: "编排三级分类、统一错误处理、辅助标注实验、RCA 与运行上报。",
    nodes: [
      n("main-start", "开始节点", "entry", 30, 300, "接收图片分类任务及全局运行参数。", "item_info / batch_id / Prompt 配置", "启动信号"),
      n("main-init", "init", "input", 240, 300, "解析 item_info，提取 item_id、图片列表、标题并记录入口时间。", "item_info / batch_id", "item_id / imageUrlList / entry_start_time"),
      n("main-item-check", "CheckItemId", "decision", 450, 300, "item_id 非空时继续，否则生成输入错误。", "item_id", "继续 / 缺失分支"),
      n("main-item-error", "ItemIdMissingError", "result", 660, 540, "生成缺少 item_id 的标准错误。", "缺失分支", "1001 / INPUT_NO_ITEM_ID"),
      n("main-image-check", "CheckImageUrlList", "decision", 660, 300, "图片列表有效时继续，否则生成空图片错误。", "has_image_url_list", "继续 / 缺失分支"),
      n("main-image-error", "ImageUrlListMissingError", "result", 870, 560, "生成图片列表为空的标准错误。", "缺失分支", "1002 / INPUT_EMPTY_IMAGE_URL_LIST"),
      n("main-config", "T5_Agent_Config", "context", 870, 300, "按 agent_key 和版本读取整条链路使用的 Prompt 配置。", "agent_key / agent_version", "configRawData / agent_config_error"),
      n("main-config-check", "checkAgentError", "decision", 1080, 300, "配置读取无错误时进入解析，否则提前结束。", "agent_config_error", "继续 / 结束"),
      n("main-config-extract", "extractConfigData", "context", 1290, 300, "提取 L1、L3 System、L3 Rules 的 Prompt key 与版本。", "configRawData", "configData / Prompt 引用"),
      n("main-l1", "PT_DEV_L1", "inference", 1500, 300, "调用 L1 V7，生成一级类目候选和 L1 诊断字段。", "图片 / L1 Prompt / GT", "L1Answer / L1_error"),
      n("main-l1-check", "CheckLayer1Result", "decision", 1710, 300, "L1 无错误时继续 L2，否则进入统一错误聚合。", "L1_err_reason", "L2 / 错误"),
      n("main-l2", "PT_DEV_L2", "inference", 1920, 300, "调用 L2 V7，按一级类目循环召回并排序叶子候选。", "L1Answer / configData / 图片", "L2Answerlist / recommendation"),
      n("main-l2-check", "CheckLayer2Result", "decision", 2130, 300, "L2 无错误时继续 L3，否则进入统一错误聚合。", "L2_error", "L3 / 错误"),
      n("main-l3", "PT_DEV_L3", "inference", 2340, 300, "调用 L3 V4，在多个叶子候选之间裁决最终 Top-1。", "L2Answerlist / L3 Prompt", "top1 / candidateList / L3_error"),
      n("main-error", "ErrorCodeAggregate", "result", 2760, 480, "聚合输入和三层错误，并补充空答案兜底错误 3099。", "各层 error / answer", "error_code / err_reason / detail"),
      n("main-assist", "AssignIsAssistedLabeling", "result", 2970, 480, "对白名单叶子类目做 50/50 辅助标注实验分组。", "agent_recommendation", "isAssistedlabeling"),
      n("main-metric", "BuildMetricPayload", "report", 3180, 560, "组装整条链路的错误、延迟、排队时长和实验组指标。", "错误 / 时间 / 实验组", "MetricReportData"),
      n("main-report-metric", "ReportMetric", "report", 3390, 560, "将总链路运行指标发送到监控服务。", "MetricReportData", "上报状态"),
      n("main-rca-prompt", "RCAPrompt", "prompt", 2550, 80, "定位 L1/L2/L3 失败层；正确样本、系统错误或缺图时跳过模型 RCA。", "三层结果 / Prompt / GT / 图片", "skip_rca / RCA Prompt / rca_layer"),
      n("main-rca-check", "checkRCASKip", "decision", 2760, 80, "仅当 skip_rca=false 时进入模型根因分析。", "skip_rca", "RCA / 跳过"),
      n("main-rca-model", "rca_model", "context", 2970, 80, "准备 RCA 模型参数，当前固定使用 gemini_3f。", "item_id / model_name / operator", "模型配置"),
      n("main-rca-call", "AIA_ModelCall", "inference", 3180, 80, "结合图片、分类证据和 Prompt 规则生成标准 RCA JSON。", "RCA System / User Prompt", "rca_answer / raw response"),
      n("main-rca-post", "RCAPostProcess", "result", 3390, 80, "清洗 RCA JSON、补充 rca_layer 并组装 Trace payload。", "RCA 响应 / 样本上下文", "RCAResutData"),
      n("main-trace", "ReportTrace", "report", 3600, 80, "将 RCA 结论和证据写入 AIA Trace。", "RCAResutData", "上报状态"),
      n("main-end", "结束节点", "entry", 3810, 300, "返回分类、候选、实验组、Trace 和统一错误字段。", "主结果与旁路状态", "top1 / recommendation / error"),
    ],
    edges: [
      ["main-start", "main-init"], ["main-init", "main-item-check"],
      ["main-item-check", "main-image-check"], ["main-item-check", "main-item-error"],
      ["main-image-check", "main-config"], ["main-image-check", "main-image-error"],
      ["main-item-error", "main-error"], ["main-image-error", "main-error"],
      ["main-config", "main-config-check"], ["main-config-check", "main-config-extract"],
      ["main-config-check", "main-end"], ["main-config-extract", "main-l1"],
      ["main-l1", "main-l1-check"], ["main-l1-check", "main-l2"],
      ["main-l1-check", "main-error"], ["main-l2", "main-l2-check"],
      ["main-l2-check", "main-l3"], ["main-l2-check", "main-error"],
      ["main-l3", "main-error"], ["main-l3", "main-rca-prompt"],
      ["main-error", "main-assist"], ["main-assist", "main-end"],
      ["main-assist", "main-metric"], ["main-metric", "main-report-metric"],
      ["main-report-metric", "main-end"], ["main-rca-prompt", "main-rca-check"],
      ["main-rca-check", "main-end"], ["main-rca-check", "main-rca-model"],
      ["main-rca-model", "main-rca-call"], ["main-rca-call", "main-rca-post"],
      ["main-rca-post", "main-end"], ["main-rca-post", "main-trace"],
      ["main-trace", "main-end"],
    ],
  },
  l1: {
    title: "PT_Layer1 · 一级召回链路",
    subtitle: "从图片信号中召回一级类目，优先保证正确子树不被漏掉。",
    nodes: [
      n("l1-start", "开始节点", "entry", 30, 270, "接收一次新的一级分类任务。", "运行请求", "启动信号"),
      n("l1-init", "init", "entry", 240, 270, "记录工作流开始时间与入口时间。", "初始上下文", "start_time / entry_start_time"),
      n("l1-input", "prepInputs", "input", 450, 270, "标准化 item_id 与图片 URL 列表。", "item_id / imageUrlList", "标准输入"),
      n("l1-item", "checkItemId", "decision", 660, 270, "校验 item_id 是否存在。", "item_id", "继续 / 异常"),
      n("l1-image", "checkImageUrlList", "decision", 870, 270, "校验图片列表是否为空。", "imageUrlList", "继续 / 异常"),
      n("l1-model", "modelConfig", "context", 1080, 130, "选择模型及推理参数，默认使用 gemini_3f。", "item_id / model_name / operator", "模型配置"),
      n("l1-aia", "AiaPrompt", "context", 1080, 410, "按 Prompt Key 与版本读取 L1 System Prompt。", "L1 Prompt 引用", "L1_system_prompt"),
      n("l1-prompt-check", "checkL1System", "decision", 1290, 410, "检查 Prompt 是否成功加载。", "L1_system_prompt", "继续 / 异常"),
      n("l1-compose", "prepTier1Prompt", "prompt", 1500, 210, "将图片和标题组装为多模态用户消息。", "图片 / 标题 / 模型名", "L1_user_message"),
      n("l1-call", "AIA_ModelCall", "inference", 1710, 210, "执行第一轮一级分类推理。", "System + User Prompt", "首轮模型响应"),
      n("l1-probe", "probeL1Parse", "decision", 1920, 210, "按正式解析规则检查首轮结果是否可用。", "首轮 answer / raw response", "usable / parse_error"),
      n("l1-retry-check", "checkL1RawResp", "decision", 2130, 210, "结果可解析则通过，否则进入补偿调用。", "L1_r1_usable", "首轮 / 重试"),
      n("l1-retry", "AIA_ModelCall_retry", "inference", 2130, 420, "首轮为空或不可解析时，再调用一次模型。", "相同 Prompt 与配置", "第二轮响应"),
      n("l1-merge", "mergeL1LLM", "result", 2340, 270, "优先采用可用首轮结果，否则使用重试结果。", "两轮结果", "统一 L1 模型结果"),
      n("l1-final-check", "checkL1FinalRaw", "decision", 2550, 270, "确认最终模型响应非空。", "L1_raw_resp", "继续 / 异常"),
      n("l1-result-check", "checkLayer1Result", "decision", 2760, 270, "检查 L1_error，成功时进入标准类目映射。", "L1_error", "映射 / 异常"),
      n("l1-taxonomy", "TAXONOMY_DATA", "context", 2970, 100, "提供 Tier-3 到 Tier-1 的标准映射表。", "静态 taxonomy", "TAXONOMY_DATA"),
      n("l1-extract", "extractLayer1Exact", "result", 3180, 190, "解析 JSON 数组，并从 GT 反查标准 L1 类目。", "模型答案 / taxonomy / GT", "L1Answer / L1_gt"),
      n("l1-preout", "preOutput", "result", 3390, 300, "统一整理结果、错误、Prompt 与 Trace payload。", "分类结果与运行上下文", "L1 输出 / reportData"),
      n("l1-error", "ErrorCodeNormalize", "result", 3600, 300, "将缺图、解析和模型异常归一为标准错误码。", "L1 错误与答案", "error_code / err_reason"),
      n("l1-metric", "BuildMetricPayload", "report", 3810, 420, "计算耗时、排队时间并构造指标数据。", "错误码 / 时间", "MetricReportData"),
      n("l1-report-metric", "ReportMetric", "report", 4020, 420, "将运行指标发送到监控系统。", "MetricReportData", "上报状态"),
      n("l1-trace", "ReportTrace", "report", 3600, 120, "记录 L1 Prompt、模型结果和执行上下文。", "reportData", "Trace 状态"),
      n("l1-end", "结束节点", "entry", 4230, 270, "返回一级候选、错误信息和 Trace 字段。", "结果与上报状态", "L1Answer / L1_gt / error"),
    ],
    edges: [
      ["l1-start", "l1-init"], ["l1-init", "l1-input"], ["l1-input", "l1-item"],
      ["l1-item", "l1-image"], ["l1-item", "l1-preout"], ["l1-image", "l1-model"],
      ["l1-image", "l1-aia"], ["l1-image", "l1-preout"], ["l1-model", "l1-compose"],
      ["l1-aia", "l1-prompt-check"], ["l1-prompt-check", "l1-compose"], ["l1-prompt-check", "l1-preout"],
      ["l1-compose", "l1-call"], ["l1-call", "l1-probe"], ["l1-probe", "l1-retry-check"],
      ["l1-retry-check", "l1-merge"], ["l1-retry-check", "l1-retry"], ["l1-retry", "l1-merge"],
      ["l1-merge", "l1-final-check"], ["l1-final-check", "l1-result-check"], ["l1-final-check", "l1-preout"],
      ["l1-result-check", "l1-taxonomy"], ["l1-taxonomy", "l1-extract"], ["l1-extract", "l1-preout"],
      ["l1-result-check", "l1-preout"], ["l1-preout", "l1-error"], ["l1-preout", "l1-trace"],
      ["l1-error", "l1-metric"], ["l1-metric", "l1-report-metric"], ["l1-trace", "l1-end"],
      ["l1-report-metric", "l1-end"],
    ],
  },
  l2: {
    title: "PT_Layer2 · 二级细分类链路",
    subtitle: "按 L1 路由循环加载专属 Prompt，在受限子树中召回叶子候选。",
    nodes: [
      n("l2-start", "开始节点", "entry", 30, 270, "接收 L1 结果、图片和 Prompt 配置。", "L1Answer / configData", "启动信号"),
      n("l2-init", "init", "entry", 240, 390, "记录 L2 的开始时间。", "运行上下文", "entry_start_time"),
      n("l2-image", "checkImageUrlList", "decision", 450, 270, "图片存在才进入模型主链。", "imageUrlList", "继续 / 跳过"),
      n("l2-model", "modelConfig", "context", 660, 120, "准备模型 endpoint、名称和推理参数。", "item_id / model_name", "模型配置"),
      n("l2-map", "L2_PromptConfig", "prompt", 660, 390, "将每个 L1 类目映射到对应 L2 Prompt key 和版本。", "L1Answer / configData", "L2PromptList"),
      n("l2-route", "checkLayer1Result", "decision", 870, 270, "Prompt 数量大于 0 才进入循环细分。", "L2PromptLength", "循环 / 直接输出"),
      n("l2-loop", "循环节点", "inference", 1080, 270, "逐个处理 L1 类目对应的 L2 Prompt。", "L2PromptList", "L2_output_list"),
      n("l2-extract", "extractL2Prompt", "prompt", 1290, 120, "提取当前循环项的 key、version、env 和类目名。", "当前 Prompt 项", "Prompt 引用"),
      n("l2-aia", "AiaPrompt", "context", 1500, 120, "获取当前 L1 子树对应的 L2 System Prompt。", "Prompt 引用", "L2_system_prompt"),
      n("l2-prompt-check", "checkPromptResult", "decision", 1710, 120, "Prompt 非空才进入模型调用。", "L2_system_prompt", "调用 / 错误"),
      n("l2-input", "layer2_input", "input", 1920, 120, "将图片和标题构造成多模态输入。", "图片 / 标题", "L2_user_prompt"),
      n("l2-call", "AIA_ModelCall", "inference", 2130, 120, "生成当前子树的叶子候选。", "L2 Prompt / 模型配置", "首轮候选"),
      n("l2-probe", "probeL2Parse", "decision", 2340, 120, "验证首轮结果是否满足最终解析契约。", "answer / raw response", "usable / parse_error"),
      n("l2-retry-check", "checkL2RawResp", "decision", 2550, 120, "首轮不可用时进入补偿调用。", "L2_r1_usable", "首轮 / 重试"),
      n("l2-retry", "AIA_ModelCall_retry", "inference", 2550, 350, "重新执行当前子树的模型推理。", "相同 Prompt 与配置", "第二轮候选"),
      n("l2-merge", "mergeL2LLM", "result", 2760, 230, "选择首个可解析结果并统一错误信息。", "两轮结果", "最终单路结果"),
      n("l2-output", "layer2_output", "result", 2970, 230, "封装单个 L1 子树的候选、Prompt、usage 和错误。", "单路模型结果", "L2_output"),
      n("l2-taxonomy", "TaxonomyData", "context", 1080, 520, "提供叶子类目元数据，供聚合与推荐使用。", "静态 taxonomy", "taxonomyData"),
      n("l2-final", "FinalOutput", "result", 3210, 270, "聚合循环结果、按置信度排序并生成 Top-3 推荐。", "循环结果 / taxonomy", "候选与推荐"),
      n("l2-error", "ErrorCodeNormalize", "result", 3420, 270, "统一模型、Prompt 和候选错误码。", "L2_error / L2Answerlist", "error_code / err_reason"),
      n("l2-metric", "BuildMetricPayload", "report", 3630, 410, "构造 L2 运行指标。", "错误码 / 时间", "MetricReportData"),
      n("l2-report-metric", "ReportMetric", "report", 3840, 410, "上报 L2 运行指标。", "MetricReportData", "上报状态"),
      n("l2-trace", "ReportTrace", "report", 3420, 100, "记录各子树的 Prompt、响应和聚合结果。", "reportData", "Trace 状态"),
      n("l2-end", "结束节点", "entry", 4050, 270, "返回候选列表、排序结果和辅助标注推荐。", "结果与上报状态", "L2Answerlist / recommendation"),
    ],
    edges: [
      ["l2-start", "l2-init"], ["l2-start", "l2-taxonomy"], ["l2-init", "l2-image"],
      ["l2-image", "l2-model"], ["l2-image", "l2-final"], ["l2-model", "l2-map"],
      ["l2-map", "l2-route"], ["l2-route", "l2-loop"], ["l2-route", "l2-final"],
      ["l2-loop", "l2-extract"], ["l2-extract", "l2-aia"], ["l2-aia", "l2-prompt-check"],
      ["l2-prompt-check", "l2-input"], ["l2-prompt-check", "l2-output"], ["l2-input", "l2-call"],
      ["l2-call", "l2-probe"], ["l2-probe", "l2-retry-check"], ["l2-retry-check", "l2-merge"],
      ["l2-retry-check", "l2-retry"], ["l2-retry", "l2-merge"], ["l2-merge", "l2-output"],
      ["l2-output", "l2-loop"], ["l2-loop", "l2-final"], ["l2-taxonomy", "l2-final"],
      ["l2-final", "l2-error"], ["l2-final", "l2-trace"], ["l2-error", "l2-metric"],
      ["l2-metric", "l2-report-metric"], ["l2-trace", "l2-end"], ["l2-report-metric", "l2-end"],
    ],
  },
  l3: {
    title: "PT_Layer3 · 最终仲裁链路",
    subtitle: "在候选定义与优先级规则约束下，收敛到唯一 Top-1。",
    nodes: [
      n("l3-start", "开始节点", "entry", 30, 270, "接收 L2 候选和最终分类上下文。", "L2Answerlist / 图片", "启动信号"),
      n("l3-init", "init", "entry", 240, 410, "记录 L3 开始时间。", "运行上下文", "entry_start_time"),
      n("l3-process", "L2AnswerProcess", "input", 450, 270, "过滤无效项并按 confidence 排序，提取候选名称。", "L2Answerlist", "candidateList / skipL3"),
      n("l3-skip", "checkSkipL3", "decision", 660, 270, "候选数大于 1 才调用 L3；单候选直接返回。", "skipL3", "仲裁 / 直出"),
      n("l3-cards", "categoryCards", "context", 870, 40, "提供候选叶子类目的标准定义。", "静态类目卡", "categoryCards"),
      n("l3-model", "modelConfig", "context", 870, 180, "准备最终仲裁模型配置。", "item_id / operator", "模型配置"),
      n("l3-system", "AiaPrompt · System", "context", 870, 320, "按版本获取 L3 System Prompt。", "System Prompt 引用", "l3_system_prompt"),
      n("l3-rules", "AiaPrompt · Rules", "context", 870, 460, "获取类目优先级和冲突规则。", "Rules Prompt 引用", "规则 JSON"),
      n("l3-valid", "validPrompt", "decision", 1080, 390, "验证 Prompt 状态、必填内容及规则 JSON。", "System / Rules", "priorityRules / error"),
      n("l3-rules-check", "checkL3Rules", "decision", 1290, 390, "规则合法才进入 Prompt 组装。", "l3_prompt_error", "继续 / 异常"),
      n("l3-prompt", "prompt", "prompt", 1500, 220, "仅抽取候选相关定义和冲突规则，并附加图片。", "候选 / 类目卡 / 规则", "L3_system / L3_user"),
      n("l3-call", "AIA_ModelCall", "inference", 1710, 220, "执行首轮 Top-1 仲裁。", "L3 Prompt / 模型配置", "首轮结果"),
      n("l3-raw-check", "checkL3RawResp", "decision", 1920, 220, "首轮 raw response 为空时触发重试。", "L3_raw_resp_r1", "首轮 / 重试"),
      n("l3-retry", "AIA_ModelCall_retry", "inference", 1920, 430, "补偿执行一次 L3 推理。", "相同 Prompt 与配置", "第二轮结果"),
      n("l3-merge", "mergeL3LLM", "result", 2130, 300, "重试有响应则优先重试，否则保留首轮。", "两轮响应", "统一 L3 结果"),
      n("l3-final", "FinalOut", "result", 2340, 300, "解析 Top-1；单候选直接采用，并校验结果属于候选集。", "候选 / 模型结果", "top1 / reportData"),
      n("l3-error", "ErrorCodeNormalize", "result", 2550, 300, "归一化候选、Prompt 和模型错误。", "L3_error / candidateList", "error_code / err_reason"),
      n("l3-metric", "BuildMetricPayload", "report", 2760, 430, "构造 L3 延迟和错误指标。", "错误码 / 时间", "MetricReportData"),
      n("l3-report-metric", "ReportMetric", "report", 2970, 430, "上报 L3 运行指标。", "MetricReportData", "上报状态"),
      n("l3-trace", "ReportTrace", "report", 2550, 100, "记录最终仲裁 Prompt、候选和响应。", "reportData", "Trace 状态"),
      n("l3-end", "结束节点", "entry", 3180, 270, "输出最终 Top-1、候选、Prompt 和错误字段。", "结果与上报状态", "top1 / L3_error"),
    ],
    edges: [
      ["l3-start", "l3-init"], ["l3-start", "l3-process"], ["l3-init", "l3-process"],
      ["l3-process", "l3-skip"], ["l3-skip", "l3-final"], ["l3-skip", "l3-cards"],
      ["l3-skip", "l3-model"], ["l3-skip", "l3-system"], ["l3-skip", "l3-rules"],
      ["l3-cards", "l3-prompt"], ["l3-model", "l3-prompt"], ["l3-system", "l3-valid"],
      ["l3-rules", "l3-valid"], ["l3-valid", "l3-rules-check"], ["l3-rules-check", "l3-prompt"],
      ["l3-rules-check", "l3-final"], ["l3-prompt", "l3-call"], ["l3-call", "l3-raw-check"],
      ["l3-raw-check", "l3-merge"], ["l3-raw-check", "l3-retry"], ["l3-retry", "l3-merge"],
      ["l3-merge", "l3-final"], ["l3-final", "l3-error"], ["l3-final", "l3-trace"],
      ["l3-error", "l3-metric"], ["l3-metric", "l3-report-metric"], ["l3-trace", "l3-end"],
      ["l3-report-metric", "l3-end"],
    ],
  },
};

const OVERVIEW_PHASES = [
  {
    code: "01",
    label: "INPUT & GUARDRAILS",
    title: "输入与前置校验",
    description: "标准化任务输入，在进入模型前拦截缺失字段与无效图片。",
    color: "#42d4e8",
  },
  {
    code: "02",
    label: "CONTEXT & RULES",
    title: "配置与规则装载",
    description: "加载模型参数、Prompt、Taxonomy 与分类优先级规则。",
    color: "#8eb0ff",
  },
  {
    code: "03",
    label: "MODEL EXECUTION",
    title: "分层模型推理",
    description: "执行候选召回、细分类与最终仲裁，并在必要时补偿重试。",
    color: "#ff8ca1",
  },
  {
    code: "04",
    label: "DECISION & ASSEMBLY",
    title: "判断与结果组装",
    description: "校验模型结果、聚合候选与错误，并生成稳定输出。",
    color: "#e6b763",
  },
  {
    code: "05",
    label: "OBSERVE & IMPROVE",
    title: "观测与自动 RCA",
    description: "上报 Metric 与 Trace，自动定位错误并驱动下一轮规则迭代。",
    color: "#70d9c0",
  },
];

const LANE_DEFS = [
  { code: "A", label: "主推理链", color: "#63d6af" },
  { code: "B", label: "规则与异常", color: "#e6b763" },
  { code: "C", label: "观测与迭代", color: "#8eb0ff" },
];

const NODE_WIDTH = 190;
const NODE_HEIGHT = 72;
const LANE_TOPS = [28, 238, 448];
const LANE_NODE_TOP_OFFSET = 58;
const NODE_START_X = 126;
const NODE_X_GAP = 224;

const nodeLayer = document.querySelector("#nodeLayer");
const edgeLayer = document.querySelector("#edgeLayer");
const canvasStage = document.querySelector("#canvasStage");
const canvasViewport = document.querySelector("#canvasViewport");
const stageFilters = document.querySelector("#stageFilters");
const layerTabs = [...document.querySelectorAll(".layer-tab")];
const viewTabs = [...document.querySelectorAll(".view-tab")];
const lineageTabs = [...document.querySelectorAll(".lineage-tab")];
const workspace = document.querySelector(".workspace");
const overviewFlowTrack = document.querySelector("#overviewFlowTrack");
const inspectorPanel = document.querySelector("#inspector");
const inspector = {
  index: document.querySelector("#inspectorIndex"),
  stage: document.querySelector("#inspectorStage"),
  title: document.querySelector("#inspectorTitle"),
  description: document.querySelector("#inspectorDescription"),
  input: document.querySelector("#inspectorInput"),
  output: document.querySelector("#inspectorOutput"),
  note: document.querySelector("#inspectorNote"),
  upstreamCount: document.querySelector("#upstreamCount"),
  downstreamCount: document.querySelector("#downstreamCount"),
  upstreamNodes: document.querySelector("#upstreamNodes"),
  downstreamNodes: document.querySelector("#downstreamNodes"),
};

let activeLayer = "main";
let activeStage = "all";
let selectedNode = null;
let activeView = "overview";
let activeLineageMode = "direct";
let scale = 0.8;
let panX = 20;
let panY = 45;
let dragging = false;
let dragStart = null;

function getWorkflow() {
  return workflows[activeLayer];
}

function getNode(id) {
  return getWorkflow().nodes.find((node) => node.id === id);
}

function stageNames() {
  return [...new Set(getWorkflow().nodes.map((node) => node.stage))];
}

function phaseIndexForNode(node) {
  const id = node.id.toLowerCase();
  const name = node.name.toLowerCase();
  if (/rca|metric|trace|report/.test(id) || node.stage === "report") return 4;
  if (
    /start|init|item-check|image-check|prepinputs/.test(id) ||
    name === "开始节点" ||
    node.stage === "input"
  ) return 0;
  if (node.stage === "context" || node.stage === "prompt") return 1;
  if (node.stage === "inference") return 2;
  return 3;
}

function laneIndexForNode(node) {
  const id = node.id.toLowerCase();
  if (/rca|metric|trace|report/.test(id) || node.stage === "report") return 2;
  if (node.stage === "decision" || node.stage === "context" || node.stage === "prompt") return 1;
  if (/error/.test(id)) return 1;
  return node.stage === "result" ? 2 : 0;
}

function getGraphLayout(workflow) {
  const lanes = LANE_DEFS.map(() => []);
  workflow.nodes.forEach((node) => lanes[laneIndexForNode(node)].push(node));
  const positions = new Map();

  lanes.forEach((nodes, laneIndex) => {
    nodes
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .forEach((node, columnIndex) => {
        positions.set(node.id, {
          ...node,
          x: NODE_START_X + columnIndex * NODE_X_GAP,
          y: LANE_TOPS[laneIndex] + LANE_NODE_TOP_OFFSET,
          laneIndex,
        });
      });
  });

  const longestLane = Math.max(...lanes.map((nodes) => nodes.length));
  return {
    lanes,
    positions,
    width: Math.max(1280, NODE_START_X + longestLane * NODE_X_GAP + 70),
    height: 660,
  };
}

function edgeKey(fromId, toId) {
  return `${fromId}->${toId}`;
}

function walkLineage(startId, direction) {
  const workflow = getWorkflow();
  const nodeIds = new Set();
  const edgeIds = new Set();
  const queue = [startId];

  while (queue.length) {
    const currentId = queue.shift();
    workflow.edges.forEach(([fromId, toId]) => {
      const matches = direction === "upstream" ? toId === currentId : fromId === currentId;
      if (!matches) return;
      const nextId = direction === "upstream" ? fromId : toId;
      edgeIds.add(edgeKey(fromId, toId));
      if (nextId !== startId && !nodeIds.has(nextId)) {
        nodeIds.add(nextId);
        queue.push(nextId);
      }
    });
  }

  return { nodeIds, edgeIds };
}

function getLineage(nodeId = selectedNode) {
  if (!nodeId) {
    return {
      upstreamNodes: new Set(),
      downstreamNodes: new Set(),
      upstreamEdges: new Set(),
      downstreamEdges: new Set(),
      visibleNodes: new Set(),
    };
  }

  const workflow = getWorkflow();
  if (activeLineageMode === "full") {
    const upstream = walkLineage(nodeId, "upstream");
    const downstream = walkLineage(nodeId, "downstream");
    return {
      upstreamNodes: upstream.nodeIds,
      downstreamNodes: downstream.nodeIds,
      upstreamEdges: upstream.edgeIds,
      downstreamEdges: downstream.edgeIds,
      visibleNodes: new Set([nodeId, ...upstream.nodeIds, ...downstream.nodeIds]),
    };
  }

  const upstreamNodes = new Set();
  const downstreamNodes = new Set();
  const upstreamEdges = new Set();
  const downstreamEdges = new Set();
  workflow.edges.forEach(([fromId, toId]) => {
    if (toId === nodeId) {
      upstreamNodes.add(fromId);
      upstreamEdges.add(edgeKey(fromId, toId));
    }
    if (fromId === nodeId) {
      downstreamNodes.add(toId);
      downstreamEdges.add(edgeKey(fromId, toId));
    }
  });

  return {
    upstreamNodes,
    downstreamNodes,
    upstreamEdges,
    downstreamEdges,
    visibleNodes: new Set([nodeId, ...upstreamNodes, ...downstreamNodes]),
  };
}

function edgeKind(fromId, toId) {
  const from = getNode(fromId);
  const to = getNode(toId);
  const ids = `${fromId} ${toId}`.toLowerCase();
  if (ids.includes("retry")) return "retry";
  if (
    toId.toLowerCase().includes("error") ||
    (from?.stage === "decision" && to?.stage === "result" && /preout|error/.test(toId.toLowerCase()))
  ) return "failure";
  if (from?.stage === "decision" && /end|final/.test(toId.toLowerCase())) return "skip";
  return "normal";
}

function renderOverview() {
  const workflow = getWorkflow();
  const groupedNodes = OVERVIEW_PHASES.map(() => []);
  workflow.nodes.forEach((node) => groupedNodes[phaseIndexForNode(node)].push(node));

  document.querySelector("#overviewFlowTitle").textContent = workflow.title;
  document.querySelector("#overviewFlowSubtitle").textContent = workflow.subtitle;
  document.querySelector("#overviewPhaseCount").textContent = String(OVERVIEW_PHASES.length).padStart(2, "0");
  document.querySelector("#overviewNodeCount").textContent = String(workflow.nodes.length).padStart(2, "0");

  overviewFlowTrack.innerHTML = OVERVIEW_PHASES.map((phase, index) => `
    <article class="overview-phase" style="--phase-color:${phase.color}">
      <header><span>${phase.code} / ${phase.label}</span><b>${String(groupedNodes[index].length).padStart(2, "0")}</b></header>
      <h4>${phase.title}</h4>
      <p>${phase.description}</p>
      <button type="button" data-phase="${index}">
        <span>查看相关节点</span>
        <i data-lucide="arrow-up-right"></i>
      </button>
    </article>
  `).join("");

  overviewFlowTrack.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const nodes = groupedNodes[Number(button.dataset.phase)];
      setViewMode("detail");
      selectNode(nodes[0]?.id || null, true);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function renderFilters() {
  stageFilters.innerHTML = [
    `<button class="stage-filter active" data-stage="all">全部阶段</button>`,
    ...stageNames().map(
      (key) =>
        `<button class="stage-filter" data-stage="${key}" style="--stage-color:${STAGES[key].color}">${STAGES[key].label}</button>`,
    ),
  ].join("");

  stageFilters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      activeStage = button.dataset.stage;
      stageFilters.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      renderGraph();
    });
  });
}

function renderGraph() {
  const workflow = getWorkflow();
  const layout = getGraphLayout(workflow);
  canvasStage.style.width = `${layout.width}px`;
  canvasStage.style.height = `${layout.height}px`;
  edgeLayer.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
  document.querySelector("#canvasTitle").textContent = workflow.title;
  document.querySelector("#nodeCount").textContent = `${workflow.nodes.length} nodes`;

  const lineage = getLineage();

  const lanes = LANE_DEFS.map(
    (lane, index) => `
      <div
        class="workflow-lane"
        style="top:${LANE_TOPS[index]}px;--lane-color:${lane.color}"
      >
        <span><b>${lane.code}</b>${lane.label}</span>
      </div>
    `,
  ).join("");

  const nodes = workflow.nodes
    .map((node, index) => {
      const stage = STAGES[node.stage];
      const position = layout.positions.get(node.id);
      const dimmed = activeStage !== "all" && activeStage !== node.stage;
      const contextDimmed = selectedNode && !lineage.visibleNodes.has(node.id);
      const upstream = lineage.upstreamNodes.has(node.id);
      const downstream = lineage.downstreamNodes.has(node.id);
      return `
        <button
          class="flow-node${selectedNode === node.id ? " selected" : ""}${dimmed ? " dimmed" : ""}${contextDimmed ? " context-dimmed" : ""}${upstream ? " lineage-upstream" : ""}${downstream ? " lineage-downstream" : ""}"
          data-node-id="${node.id}"
          style="left:${position.x}px;top:${position.y}px;--node-color:${stage.color}"
          aria-label="${node.name}"
        >
          <span class="flow-node-icon"><i data-lucide="${stage.icon}"></i></span>
          <span><small>${String(index + 1).padStart(2, "0")} · ${stage.label}</small><strong>${node.name}</strong></span>
        </button>`;
    })
    .join("");
  nodeLayer.innerHTML = lanes + nodes;

  const arrowDefs = `
    <defs>
      <marker id="arrow-muted" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker>
      <marker id="arrow-upstream" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker>
      <marker id="arrow-downstream" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" /></marker>
    </defs>`;

  const edges = workflow.edges
    .map(([fromId, toId]) => {
      const from = layout.positions.get(fromId);
      const to = layout.positions.get(toId);
      if (!from || !to) return "";
      const x1 = from.x + NODE_WIDTH;
      const y1 = from.y + NODE_HEIGHT / 2;
      const x2 = to.x;
      const y2 = to.y + NODE_HEIGHT / 2;
      const bend = Math.max(45, Math.abs(x2 - x1) * 0.42);
      const key = edgeKey(fromId, toId);
      const upstream = lineage.upstreamEdges.has(key);
      const downstream = lineage.downstreamEdges.has(key);
      const active = upstream || downstream;
      const direct = selectedNode && (fromId === selectedNode || toId === selectedNode);
      const kind = edgeKind(fromId, toId);
      const hidden =
        activeStage !== "all" &&
        from.stage !== activeStage &&
        to.stage !== activeStage;
      const faded = selectedNode && !active;
      const opacity = hidden || faded ? 0.07 : 1;
      const marker = upstream ? "arrow-upstream" : downstream ? "arrow-downstream" : "arrow-muted";
      const label = upstream ? "UPSTREAM" : downstream ? "DOWNSTREAM" : "";
      const kindLabel = kind === "retry" ? "RETRY" : kind === "failure" ? "ERROR" : kind === "skip" ? "SKIP" : "";
      const labelText = [label, kindLabel].filter(Boolean).join(" · ");
      const labelX = (x1 + x2) / 2;
      const labelY = (y1 + y2) / 2 - 8;
      return `
        <path
          class="edge-path edge-${kind}${upstream ? " lineage-upstream" : ""}${downstream ? " lineage-downstream" : ""}"
          style="opacity:${opacity}"
          marker-end="url(#${marker})"
          d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}"
        />
        ${direct && labelText ? `<text class="edge-label edge-label-${kind}" x="${labelX}" y="${labelY}">${labelText}</text>` : ""}
      `;
    })
    .join("");
  edgeLayer.innerHTML = arrowDefs + edges;

  nodeLayer.querySelectorAll(".flow-node").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selectNode(button.dataset.nodeId, true);
    });
  });

  if (window.lucide) window.lucide.createIcons();
  applyTransform();
}

function updateInspector() {
  const workflow = getWorkflow();
  const node = getNode(selectedNode) || workflow.nodes[0];
  const lineage = getLineage(node.id);
  const index = workflow.nodes.indexOf(node) + 1;
  inspector.index.textContent = String(index).padStart(2, "0");
  inspector.stage.textContent = STAGES[node.stage].label;
  inspector.stage.style.color = STAGES[node.stage].color;
  inspector.title.textContent = node.name;
  inspector.description.textContent = node.description;
  inspector.input.textContent = node.input;
  inspector.output.textContent = node.output;
  inspector.note.textContent =
    node.note || `当前节点位于“${STAGES[node.stage].label}”阶段。`;
  inspector.upstreamCount.textContent = lineage.upstreamNodes.size;
  inspector.downstreamCount.textContent = lineage.downstreamNodes.size;
  renderLineageList(inspector.upstreamNodes, lineage.upstreamNodes, "当前节点没有上游依赖");
  renderLineageList(inspector.downstreamNodes, lineage.downstreamNodes, "当前节点没有下游输出");
}

function renderLineageList(container, nodeIds, emptyText) {
  const workflow = getWorkflow();
  const nodes = [...nodeIds]
    .map((id) => workflow.nodes.find((node) => node.id === id))
    .filter(Boolean);
  container.innerHTML = nodes.length
    ? nodes
      .map((node) => `<button type="button" data-related-node="${node.id}">${node.name}<i data-lucide="arrow-right"></i></button>`)
      .join("")
    : `<span class="lineage-empty">${emptyText}</span>`;

  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => selectNode(button.dataset.relatedNode, true));
  });
  if (window.lucide) window.lucide.createIcons();
}

function selectNode(nodeId, shouldFocus = false) {
  if (!nodeId) return;
  selectedNode = nodeId;
  updateInspector();
  setInspectorOpen(true);
  renderGraph();
  if (shouldFocus) requestAnimationFrame(() => focusNode(nodeId));
}

function setInspectorOpen(open) {
  inspectorPanel.classList.toggle("open", open);
  inspectorPanel.setAttribute("aria-hidden", String(!open));
  inspectorPanel.toggleAttribute("inert", !open);
}

function applyTransform() {
  canvasStage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  document.querySelector("#zoomValue").textContent = `${Math.round(scale * 100)}%`;
}

function fitView() {
  const workflow = getWorkflow();
  const layout = getGraphLayout(workflow);
  const bounds = canvasViewport.getBoundingClientRect();
  scale = Math.min(0.9, (bounds.width - 30) / layout.width, (bounds.height - 30) / layout.height);
  scale = Math.max(0.28, scale);
  panX = 14;
  panY = Math.max(14, (bounds.height - layout.height * scale) / 2);
  applyTransform();
}

function resetReadableView() {
  scale = window.innerWidth <= 640 ? 0.68 : 0.78;
  panX = 18;
  panY = 14;
  applyTransform();
}

function focusNode(nodeId) {
  const position = getGraphLayout(getWorkflow()).positions.get(nodeId);
  if (!position) return;
  const bounds = canvasViewport.getBoundingClientRect();
  const drawerWidth = window.innerWidth <= 640 ? 0 : Math.min(360, bounds.width * 0.42);
  const usableWidth = Math.max(260, bounds.width - drawerWidth);
  panX = usableWidth / 2 - (position.x + NODE_WIDTH / 2) * scale;
  panY = bounds.height / 2 - (position.y + NODE_HEIGHT / 2) * scale;
  applyTransform();
}

function setViewMode(view) {
  activeView = view;
  workspace.dataset.view = view;
  viewTabs.forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (view === "detail") requestAnimationFrame(resetReadableView);
  else setInspectorOpen(false);
}

function changeLayer(layer) {
  activeLayer = layer;
  activeStage = "all";
  selectedNode = null;
  activeLineageMode = "direct";
  layerTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.layer === layer));
  lineageTabs.forEach((tab) => {
    const active = tab.dataset.lineage === activeLineageMode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  renderFilters();
  renderOverview();
  updateInspector();
  renderGraph();
  setInspectorOpen(false);
  if (activeView === "detail") requestAnimationFrame(resetReadableView);
}

layerTabs.forEach((tab) => tab.addEventListener("click", () => changeLayer(tab.dataset.layer)));
viewTabs.forEach((tab) => tab.addEventListener("click", () => setViewMode(tab.dataset.view)));
lineageTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeLineageMode = tab.dataset.lineage;
    lineageTabs.forEach((item) => {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
    });
    updateInspector();
    renderGraph();
    if (selectedNode) requestAnimationFrame(() => focusNode(selectedNode));
  });
});
document.querySelector("#inspectorClose").addEventListener("click", () => {
  selectedNode = null;
  setInspectorOpen(false);
  renderGraph();
});

document.querySelector("#zoomIn").addEventListener("click", () => {
  scale = Math.min(1.35, scale + 0.1);
  applyTransform();
});

document.querySelector("#zoomOut").addEventListener("click", () => {
  scale = Math.max(0.2, scale - 0.1);
  applyTransform();
});

document.querySelector("#fitView").addEventListener("click", fitView);

canvasViewport.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    scale = Math.max(0.2, Math.min(1.35, scale + (event.deltaY < 0 ? 0.08 : -0.08)));
    applyTransform();
  },
  { passive: false },
);

canvasViewport.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".flow-node, button")) return;
  dragging = true;
  dragStart = { x: event.clientX - panX, y: event.clientY - panY };
  canvasViewport.classList.add("dragging");
  canvasViewport.setPointerCapture(event.pointerId);
});

canvasViewport.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  panX = event.clientX - dragStart.x;
  panY = event.clientY - dragStart.y;
  applyTransform();
});

canvasViewport.addEventListener("pointerup", () => {
  dragging = false;
  canvasViewport.classList.remove("dragging");
});

document.querySelector("#downloadSvg").addEventListener("click", () => {
  const workflow = getWorkflow();
  const layout = getGraphLayout(workflow);
  const { width, height } = layout;
  const lines = workflow.edges
    .map(([fromId, toId]) => {
      const from = layout.positions.get(fromId);
      const to = layout.positions.get(toId);
      return `<line x1="${from.x + NODE_WIDTH}" y1="${from.y + NODE_HEIGHT / 2}" x2="${to.x}" y2="${to.y + NODE_HEIGHT / 2}" stroke="#4b5d7c" stroke-width="2"/>`;
    })
    .join("");
  const boxes = workflow.nodes
    .map((node) => {
      const position = layout.positions.get(node.id);
      const color = STAGES[node.stage].color;
      return `<g><rect x="${position.x}" y="${position.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="4" fill="#151d30" stroke="${color}"/><text x="${position.x + 14}" y="${position.y + 28}" fill="#8290a8" font-family="monospace" font-size="9">${STAGES[node.stage].label}</text><text x="${position.x + 14}" y="${position.y + 51}" fill="#f7f8fb" font-family="sans-serif" font-size="12">${node.name.replaceAll("&", "&amp;")}</text></g>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#070a13"/>${lines}${boxes}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${activeLayer}-workflow.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
});

window.addEventListener("resize", fitView);

workspace.dataset.view = activeView;
renderFilters();
updateInspector();
renderOverview();
renderGraph();
if (window.lucide) window.lucide.createIcons();

const promptSections = [
  {
    code: "01 / ROLE",
    title: "Role Definition",
    subtitle: "角色定义",
    items: [
      "说明模型承担的专业角色与任务目标",
      "明确任务是多标签还是单标签分类",
      "强调高召回、证据驱动和禁止幻觉",
    ],
    intent: "先固定模型身份和任务边界，避免后续规则建立在模糊目标上。",
  },
  {
    code: "02 / PROCESS",
    title: "Reasoning Workflow",
    subtitle: "工作流程",
    items: [
      "先整体理解图片内容，再逐个类别独立判断",
      "允许多个类别同时成立",
      "最后按证据强度组装并排序输出",
    ],
    intent: "把识别过程拆成稳定步骤，降低遗漏类别和过早下结论的概率。",
  },
  {
    code: "03 / BOUNDARY",
    title: "High-priority Boundaries",
    subtitle: "高优先级边界规则",
    items: [
      "先判断是否属于目标大类，再区分核心子类型",
      "Residual / Other 不能作为无依据的兜底类别",
      "处理内容格式与真实意图之间的冲突",
      "明确相似类别发生冲突时的优先级",
    ],
    intent: "优先处理最容易造成误召和排序错误的决策边界。",
  },
  {
    code: "04 / RECOVERY",
    title: "Bad Case Recovery",
    subtitle: "RCA / Bad Case 修正",
    items: [
      "基于历史错误明确重点复查对象",
      "漏召类别增加 recovery 规则",
      "误召类别增加 boundary / exclusion 规则",
      "排序错误增加 re-ranking，并执行 final check",
    ],
    intent: "将历史错误转化为可执行规则，让 Prompt 随评测持续收敛。",
  },
  {
    code: "05 / TAXONOMY",
    title: "Category Schema",
    subtitle: "类目定义区",
    items: [
      "Definition：类别是什么",
      "Signals：哪些可观察证据支持命中",
      "Exclusions：哪些情况明确不能命中",
      "Priority：与相似类别冲突时如何排序",
    ],
    intent: "所有类目使用同一模板，保证定义完整且具备可比较性。",
  },
  {
    code: "06 / EVIDENCE",
    title: "Evidence Scoring",
    subtitle: "证据打分规则",
    items: [
      "每个类别独立打分，并设置统一输出阈值",
      "定义强、中、弱证据对应的分数区间",
      "共享背景证据不能重复支撑多个类别",
      "允许多标签，但每个标签必须有独立证据",
    ],
    intent: "让多标签输出建立在独立、可追溯的证据上，而不是整体印象。",
  },
  {
    code: "07 / OUTPUT",
    title: "Output Contract",
    subtitle: "输出约束",
    items: [
      "严格限定可输出的类别白名单",
      "规定输出数量范围并按置信度排序",
      "Reason 必须引用图片中的可观察证据",
      "固定为可稳定解析的 JSON Array 格式",
    ],
    intent: "用稳定的数据契约连接解析、重试、评测和下游消费。",
  },
];

const rcaRules = [
  {
    code: "A",
    title: "System failure",
    zh: "系统执行失败",
    scope: "全链路",
    rule: "图片缺失、损坏、加载失败或其他技术异常阻止可靠分析，且问题不属于标注、Taxonomy、Prompt 或模型能力。",
    action: "检查输入完整性、资源加载和执行链路，不调用 RCA 模型。",
  },
  {
    code: "B",
    title: "Foreign language",
    zh: "语言障碍",
    scope: "全链路",
    rule: "关键证据依赖某种语言，模型无法可靠理解该语言，且语言理解是分类错误的主要障碍。",
    action: "补充对应语言的 OCR、翻译或多语言理解能力。",
  },
  {
    code: "C",
    title: "Potential GT error",
    zh: "潜在标注错误",
    scope: "全链路",
    rule: "类目定义清晰，但完整图片证据稳定支持其他类目，且几乎没有决定性证据支持当前 GT。",
    action: "回查人工标注和证据链，确认后修订 GT。",
  },
  {
    code: "D",
    title: "Definition gap",
    zh: "定义设计缺口",
    scope: "L1 / L2",
    rule: "定义缺少纳入、排除或区分标准，或相邻类目重叠、模糊；错误更适合由 Taxonomy 设计解释。",
    action: "修改 Definition、Signals 或 Exclusions，明确相邻类目的分界。",
  },
  {
    code: "E",
    title: "Priority rule missing",
    zh: "优先级规则缺失",
    scope: "L3",
    rule: "多个候选都合理，但 L3 缺少明确的优先级、平局处理或冲突消解规则。",
    action: "在 L3 增加显式 Priority 或 tie-breaker 规则。",
  },
  {
    code: "F",
    title: "Prompt guidance gap",
    zh: "Prompt 指导缺口",
    scope: "L1–L3",
    rule: "定义和优先级原则基本充分，但缺少操作步骤、约束、正反例或决策清单，导致执行路径漂移。",
    action: "补充 ordered checks、示例、反例或 final check。",
  },
  {
    code: "G",
    title: "Candidate noise",
    zh: "候选集噪声",
    scope: "L2",
    rule: "GT 仍在 L2 候选中，但同时输出过多弱相关、重复或偏离候选；GT 缺失时不得使用该标签。",
    action: "收紧 L2 候选生成和 reducer 规则，降低无效候选数量。",
  },
  {
    code: "H",
    title: "True boundary case",
    zh: "真实边界案例",
    scope: "全链路",
    rule: "定义已经合理，且不存在现实可行的 Prompt、规则或定义修改能稳定区分；图片确实支持多个类目。",
    action: "沉淀到 Hard Case Library，作为边界评测样本持续跟踪。",
  },
  {
    code: "I",
    title: "Model capability gap",
    zh: "模型能力缺口",
    scope: "最后兜底",
    rule: "A–H 均不适用，定义、规则和 Prompt 已充分，但模型仍无法感知、提取或推理关键证据。",
    action: "评估模型升级、工具增强或专用识别模块，不继续堆叠 Prompt。",
  },
];

function replaceList(element, items) {
  element.replaceChildren(
    ...items.map((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      return listItem;
    }),
  );
}

function initContentExplorers() {
  const promptTabs = [...document.querySelectorAll(".prompt-tab")];
  const promptItems = document.querySelector("#promptDetailItems");

  promptTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const section = promptSections[Number(tab.dataset.promptIndex)];
      promptTabs.forEach((item) => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      document.querySelector("#promptDetailCode").textContent = section.code;
      document.querySelector("#promptDetailTitle").textContent = section.subtitle;
      document.querySelector("#promptDetailSubtitle").textContent = section.title;
      document.querySelector("#promptDetailIntent").textContent = section.intent;
      replaceList(promptItems, section.items);
    });
  });

  const rcaButtons = [...document.querySelectorAll(".rca-rule-button")];
  const rcaDetail = document.querySelector(".rca-detail");
  rcaButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const rule = rcaRules[Number(button.dataset.rcaIndex)];
      rcaButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      document.querySelector("#rcaDetailCode").textContent = rule.code;
      document.querySelector("#rcaDetailScope").textContent = rule.scope;
      document.querySelector("#rcaDetailTitle").textContent = rule.zh;
      document.querySelector("#rcaDetailZh").textContent = rule.title;
      document.querySelector("#rcaDetailRule").textContent = rule.rule;
      document.querySelector("#rcaDetailAction").textContent = rule.action;
      rcaDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });
  rcaButtons.forEach((button, index) => {
    button.setAttribute("aria-pressed", String(index === 0));
  });
}

initContentExplorers();

function initAmbientCanvas() {
  const canvas = document.querySelector("#ambientCanvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const staticPreview = new URLSearchParams(window.location.search).has("static");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const palette = [
    [104, 213, 189],
    [78, 170, 153],
    [130, 166, 158],
    [91, 126, 120],
  ];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let pulses = [];
  let frameId = 0;
  let lastTime = 0;
  let staticScrollTimer = 0;
  let scrollY = window.scrollY;
  const pointer = { x: 0, y: 0 };

  function buildParticles() {
    const count = Math.min(62, Math.max(28, Math.floor((width * height) / 26000)));
    particles = Array.from({ length: count }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.16,
      vy: (Math.random() - 0.5) * 0.12,
      size: index % 7 === 0 ? 1.5 : 0.8,
      depth: 0.3 + Math.random() * 0.7,
      color: palette[index % palette.length],
    }));
    pulses = Array.from({ length: 12 }, (_, index) => ({
      lane: index % 3,
      offset: (index / 12) * (width + 260),
      speed: 0.035 + (index % 4) * 0.008,
      length: 32 + (index % 3) * 14,
    }));
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pointer.x = width / 2;
    pointer.y = height / 2;
    buildParticles();
  }

  function drawTopographicField(time) {
    const fieldTop = height * 0.1;
    const fieldHeight = height * 0.76;
    const pointerShift = (pointer.x - width / 2) * 0.008;

    for (let row = 0; row < 13; row += 1) {
      const progress = row / 12;
      const baseY = fieldTop + progress * fieldHeight;
      ctx.beginPath();
      for (let x = -40; x <= width + 40; x += 20) {
        const wave =
          Math.sin(x * 0.007 + time * 0.00016 + row * 0.72) * (8 + progress * 18) +
          Math.cos(x * 0.0028 - time * 0.00011 + row) * 10;
        const y = baseY + wave + pointerShift * (progress - 0.5);
        if (x === -40) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle =
        row % 4 === 0
          ? `rgba(91, 194, 196, ${0.08 + progress * 0.045})`
          : `rgba(108, 137, 159, ${0.035 + progress * 0.025})`;
      ctx.lineWidth = row % 4 === 0 ? 0.9 : 0.55;
      ctx.stroke();
    }
  }

  function drawPerspectiveGrid(time) {
    const horizon = height * 0.22;
    const offset = (time * 0.012) % 56;
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(104, 213, 189, 0.09)";

    for (let y = horizon + offset; y < height + 56; y += 56) {
      const progress = (y - horizon) / Math.max(1, height - horizon);
      ctx.globalAlpha = 0.25 + progress * 0.75;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.72;
    const vanishingX = width * 0.58 + (pointer.x - width / 2) * 0.025;
    for (let x = -width; x <= width * 2; x += 96) {
      ctx.beginPath();
      ctx.moveTo(vanishingX + (x - vanishingX) * 0.12, horizon);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCircuitTraces(time) {
    const traceColors = [
      "rgba(104, 213, 189, 0.2)",
      "rgba(104, 213, 189, 0.12)",
      "rgba(180, 187, 183, 0.08)",
    ];

    for (let route = 0; route < 9; route += 1) {
      const fromLeft = route % 2 === 0;
      const direction = fromLeft ? 1 : -1;
      const startX = fromLeft ? -30 : width + 30;
      const baseY = height * (0.1 + route * 0.105);
      const firstTurn = width * (0.15 + (route % 4) * 0.08);
      const secondTurn = width * (0.44 + (route % 3) * 0.12);
      const verticalShift = ((route % 3) - 1) * 34;
      const x1 = fromLeft ? firstTurn : width - firstTurn;
      const x2 = fromLeft ? secondTurn : width - secondTurn;
      const endX = fromLeft ? Math.min(width + 20, x2 + width * 0.18) : Math.max(-20, x2 - width * 0.18);

      ctx.beginPath();
      ctx.moveTo(startX, baseY);
      ctx.lineTo(x1, baseY);
      ctx.lineTo(x1 + direction * 22, baseY + verticalShift);
      ctx.lineTo(x2, baseY + verticalShift);
      ctx.lineTo(x2 + direction * 18, baseY + verticalShift + 18);
      ctx.lineTo(endX, baseY + verticalShift + 18);
      ctx.setLineDash([1, 9]);
      ctx.lineDashOffset = -(time * 0.018 + route * 13);
      ctx.strokeStyle = traceColors[route % traceColors.length];
      ctx.lineWidth = route % 3 === 0 ? 1.1 : 0.7;
      ctx.stroke();
      ctx.setLineDash([]);

      const pulse = ((time * (0.018 + route * 0.001) + route * 97) % 260) / 260;
      const pulseX = x1 + (x2 - x1) * pulse;
      const pulseY = baseY + verticalShift;
      ctx.beginPath();
      ctx.arc(pulseX, pulseY, route % 3 === 0 ? 2.4 : 1.5, 0, Math.PI * 2);
      ctx.fillStyle = traceColors[route % traceColors.length].replace(/0\.\d+\)/, "0.72)");
      ctx.fill();
    }
  }

  function drawSignalTopology(time) {
    const compact = width < 720;
    const nodes = compact
      ? [
          [0.12, 0.18],
          [0.34, 0.13],
          [0.56, 0.2],
          [0.82, 0.15],
          [0.22, 0.72],
          [0.5, 0.78],
          [0.78, 0.7],
        ]
      : [
          [0.07, 0.18],
          [0.21, 0.12],
          [0.36, 0.23],
          [0.53, 0.14],
          [0.68, 0.24],
          [0.89, 0.16],
          [0.12, 0.72],
          [0.29, 0.82],
          [0.48, 0.69],
          [0.66, 0.8],
          [0.86, 0.71],
        ];
    const links = compact
      ? [[0, 1], [1, 2], [2, 3], [4, 5], [5, 6]]
      : [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [6, 7], [7, 8], [8, 9], [9, 10]];

    ctx.save();
    links.forEach(([fromIndex, toIndex], linkIndex) => {
      const [fromX, fromY] = nodes[fromIndex];
      const [toX, toY] = nodes[toIndex];
      const x1 = fromX * width;
      const y1 = fromY * height;
      const x2 = toX * width;
      const y2 = toY * height;
      const progress = ((time * 0.000055 + linkIndex * 0.17) % 1 + 1) % 1;
      const packetX = x1 + (x2 - x1) * progress;
      const packetY = y1 + (y2 - y1) * progress;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.setLineDash([2, 10]);
      ctx.lineDashOffset = -time * 0.008;
      ctx.strokeStyle = "rgba(104, 213, 189, 0.075)";
      ctx.lineWidth = 0.7;
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(104, 213, 189, 0.46)";
      ctx.strokeRect(packetX - 4, packetY - 4, 8, 8);
    });

    nodes.forEach(([nodeX, nodeY], index) => {
      const x = nodeX * width;
      const y = nodeY * height;
      const pulse = 3 + Math.sin(time * 0.0012 + index) * 1.2;
      ctx.beginPath();
      ctx.arc(x, y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = index % 3 === 0 ? "rgba(104, 213, 189, 0.54)" : "rgba(180, 187, 183, 0.3)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(104, 213, 189, 0.12)";
      ctx.stroke();

    });
    ctx.restore();
  }

  function drawRadarSweep(time) {
    const heroFade = Math.max(0, 1 - scrollY / Math.max(1, height * 0.9));
    if (heroFade <= 0.01) return;

    const compact = width < 720;
    const centerX = width * (compact ? 0.73 : 0.79);
    const centerY = height * (compact ? 0.34 : 0.39);
    const radius = Math.min(width, height) * (compact ? 0.24 : 0.31);
    const angle = time * 0.00018;

    ctx.save();
    ctx.globalAlpha = heroFade * 0.9;
    ctx.translate(centerX, centerY);

    ctx.strokeStyle = "rgba(104, 213, 189, 0.16)";
    ctx.lineWidth = 0.8;
    [0.48, 0.72, 1].forEach((scale, index) => {
      ctx.beginPath();
      ctx.setLineDash(index === 2 ? [3, 9] : []);
      ctx.arc(0, 0, radius * scale, -Math.PI * 0.12, Math.PI * (1.18 + index * 0.18));
      ctx.stroke();
    });
    ctx.setLineDash([]);

    for (let tick = 0; tick < 48; tick += 1) {
      const tickAngle = (Math.PI * 2 * tick) / 48 + angle * 0.22;
      const major = tick % 6 === 0;
      const inner = radius * (major ? 0.91 : 0.96);
      const outer = radius * (major ? 1.04 : 1.01);
      ctx.beginPath();
      ctx.moveTo(Math.cos(tickAngle) * inner, Math.sin(tickAngle) * inner);
      ctx.lineTo(Math.cos(tickAngle) * outer, Math.sin(tickAngle) * outer);
      ctx.strokeStyle = major ? "rgba(104, 213, 189, 0.34)" : "rgba(180, 187, 183, 0.12)";
      ctx.lineWidth = major ? 1 : 0.6;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(-radius * 0.82, 0);
    ctx.lineTo(radius * 0.82, 0);
    ctx.moveTo(0, -radius * 0.82);
    ctx.lineTo(0, radius * 0.82);
    ctx.strokeStyle = "rgba(104, 213, 189, 0.1)";
    ctx.stroke();

    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius * 0.94, 0);
    ctx.strokeStyle = "rgba(104, 213, 189, 0.58)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.94, -0.14, 0.14);
    ctx.strokeStyle = "rgba(104, 213, 189, 0.38)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawDataLanes(time) {
    const laneColors = [
      "rgba(66, 212, 232, 0.24)",
      "rgba(99, 214, 175, 0.17)",
      "rgba(165, 105, 232, 0.19)",
    ];

    laneColors.forEach((color, lane) => {
      const baseY = height * (0.2 + lane * 0.26);
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 18) {
        const y =
          baseY +
          Math.sin(x * 0.006 + time * 0.00035 + lane * 1.7) * (24 + lane * 8) +
          Math.sin(x * 0.014 - time * 0.00018) * 9;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.setLineDash([2, 11]);
      ctx.lineDashOffset = -(time * 0.025 + lane * 18);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.15;
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  function drawKineticCore(time) {
    const heroFade = Math.max(0, 1 - scrollY / Math.max(1, height * 1.05));
    if (heroFade <= 0.01) return;

    const compact = width < 720;
    const radius = Math.min(width, height) * (compact ? 0.22 : 0.28);
    const centerX =
      width * (compact ? 0.73 : 0.79) + (pointer.x - width / 2) * 0.022;
    const centerY =
      height * (compact ? 0.34 : 0.39) + (pointer.y - height / 2) * 0.014;
    const rotation = time * 0.00012;

    function polygon(sides, polygonRadius, offset = 0) {
      ctx.beginPath();
      for (let side = 0; side <= sides; side += 1) {
        const angle = offset + (Math.PI * 2 * side) / sides;
        const x = Math.cos(angle) * polygonRadius;
        const y = Math.sin(angle) * polygonRadius;
        if (side === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.globalAlpha = heroFade;

    // Three deliberate orbital planes replace the previous dense wire bundle.
    const orbitPlanes = [
      { angle: -0.42, scaleY: 0.34, size: 0.92, speed: 1 },
      { angle: 0.48, scaleY: 0.28, size: 0.78, speed: -0.72 },
      { angle: Math.PI / 2, scaleY: 0.24, size: 0.66, speed: 0.52 },
    ];
    orbitPlanes.forEach((orbit, index) => {
      ctx.save();
      ctx.rotate(orbit.angle + rotation * orbit.speed);
      ctx.scale(1, orbit.scaleY);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * orbit.size, radius * orbit.size, 0, 0, Math.PI * 2);
      ctx.strokeStyle = index === 0 ? "rgba(104, 213, 189, 0.58)" : "rgba(104, 213, 189, 0.28)";
      ctx.lineWidth = index === 0 ? 1.6 : 0.9;
      ctx.stroke();
      ctx.restore();

      const nodeAngle = rotation * (2.4 + index * 0.45) + index * 2.1;
      const cosAngle = Math.cos(nodeAngle);
      const sinAngle = Math.sin(nodeAngle);
      const orbitX = cosAngle * radius * orbit.size;
      const orbitY = sinAngle * radius * orbit.size * orbit.scaleY;
      const cosRotation = Math.cos(orbit.angle);
      const sinRotation = Math.sin(orbit.angle);
      const x = orbitX * cosRotation - orbitY * sinRotation;
      const y = orbitX * sinRotation + orbitY * cosRotation;

      ctx.beginPath();
      ctx.arc(x, y, index === 0 ? 4 : 2.8, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(104, 213, 189, 0.82)";
      ctx.fill();
      ctx.strokeStyle = "rgba(242, 244, 242, 0.38)";
      ctx.strokeRect(x - 7, y - 7, 14, 14);
    });

    // Segmented rings create a precise instrument-like silhouette.
    for (let ring = 0; ring < 4; ring += 1) {
      const ringRadius = radius * (0.46 + ring * 0.13);
      const segmentCount = 5 + ring;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const start =
          rotation * (ring % 2 === 0 ? 0.8 : -0.62) +
          (Math.PI * 2 * segment) / segmentCount;
        const span = (Math.PI * 1.34) / segmentCount;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, start, start + span);
        ctx.strokeStyle =
          ring === 1
            ? "rgba(104, 213, 189, 0.5)"
            : "rgba(180, 187, 183, 0.2)";
        ctx.lineWidth = ring === 1 ? 1.5 : 0.8;
        ctx.stroke();
      }
    }

    // A counter-rotating hexagonal reactor gives the form a clear visual center.
    ctx.save();
    ctx.rotate(-rotation * 1.4 + Math.PI / 6);
    polygon(6, radius * 0.34);
    ctx.strokeStyle = "rgba(242, 244, 242, 0.5)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    polygon(6, radius * 0.24, Math.PI / 6);
    ctx.strokeStyle = "rgba(104, 213, 189, 0.72)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    for (let spoke = 0; spoke < 6; spoke += 1) {
      const angle = (Math.PI * 2 * spoke) / 6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * radius * 0.11, Math.sin(angle) * radius * 0.11);
      ctx.lineTo(Math.cos(angle) * radius * 0.34, Math.sin(angle) * radius * 0.34);
      ctx.strokeStyle = "rgba(104, 213, 189, 0.34)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();

    const corePulse = 0.84 + Math.sin(time * 0.0022) * 0.08;
    ctx.save();
    ctx.scale(corePulse, corePulse);
    polygon(6, radius * 0.13, Math.PI / 6);
    ctx.fillStyle = "rgba(104, 213, 189, 0.1)";
    ctx.fill();
    ctx.strokeStyle = "rgba(242, 244, 242, 0.76)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.038, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(104, 213, 189, 0.9)";
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawNetwork(delta) {
    const parallaxX = (pointer.x - width / 2) * 0.012;
    const parallaxY = (pointer.y - height / 2) * 0.008;

    particles.forEach((particle) => {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      if (particle.x < -20) particle.x = width + 20;
      if (particle.x > width + 20) particle.x = -20;
      if (particle.y < -20) particle.y = height + 20;
      if (particle.y > height + 20) particle.y = -20;
    });

    for (let i = 0; i < particles.length; i += 1) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j += 1) {
        const b = particles[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 136) continue;
        ctx.strokeStyle = `rgba(90, 181, 214, ${0.09 * (1 - distance / 136)})`;
        ctx.lineWidth = 0.65;
        ctx.beginPath();
        ctx.moveTo(a.x + parallaxX * a.depth, a.y + parallaxY * a.depth);
        ctx.lineTo(b.x + parallaxX * b.depth, b.y + parallaxY * b.depth);
        ctx.stroke();
      }
    }

    particles.forEach((particle, index) => {
      const [r, g, b] = particle.color;
      const x = particle.x + parallaxX * particle.depth;
      const y = particle.y + parallaxY * particle.depth;
      ctx.beginPath();
      ctx.arc(x, y, particle.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${index % 7 === 0 ? 0.62 : 0.34})`;
      ctx.fill();
    });
  }

  function lanePoint(x, lane, time) {
    const baseY = height * (0.2 + lane * 0.26);
    return (
      baseY +
      Math.sin(x * 0.006 + time * 0.00035 + lane * 1.7) * (24 + lane * 8) +
      Math.sin(x * 0.014 - time * 0.00018) * 9
    );
  }

  function drawPulses(time) {
    const colors = [
      "rgba(108, 238, 239, 0.92)",
      "rgba(126, 234, 188, 0.82)",
      "rgba(189, 138, 239, 0.82)",
    ];

    pulses.forEach((pulse) => {
      const travel = width + 260;
      const x = (time * pulse.speed + pulse.offset) % travel - 130;
      const y = lanePoint(x, pulse.lane, time);
      const previousX = x - pulse.length;
      const previousY = lanePoint(previousX, pulse.lane, time);

      ctx.strokeStyle = colors[pulse.lane];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(previousX, previousY);
      ctx.lineTo(x, y);
      ctx.stroke();

      ctx.fillStyle = colors[pulse.lane];
      ctx.fillRect(x - 3, y - 2, 7, 4);
      ctx.strokeStyle = "rgba(239, 255, 253, 0.7)";
      ctx.strokeRect(x - 6, y - 5, 13, 10);
    });
  }

  function render(time = 0) {
    lastTime = time;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "screen";
    drawPerspectiveGrid(time);
    drawCircuitTraces(time);
    drawSignalTopology(time);
    drawRadarSweep(time);
    drawKineticCore(time);
    ctx.globalCompositeOperation = "source-over";

    if (!staticPreview && !reducedMotion.matches && !document.hidden) {
      frameId = window.requestAnimationFrame(render);
    }
  }

  function restart() {
    window.cancelAnimationFrame(frameId);
    lastTime = 0;
    render(performance.now());
  }

  window.addEventListener("resize", () => {
    resize();
    restart();
  });
  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  window.addEventListener(
    "scroll",
    () => {
      scrollY = window.scrollY;
      if (staticPreview) {
        window.clearTimeout(staticScrollTimer);
        staticScrollTimer = window.setTimeout(() => render(performance.now()), 80);
      }
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) restart();
  });
  reducedMotion.addEventListener("change", restart);

  resize();
  render(0);
}

initAmbientCanvas();

function initProjectDrawer() {
  const toggle = document.querySelector("#projectMenuToggle");
  const drawer = document.querySelector("#projectDrawer");
  const backdrop = document.querySelector("#projectDrawerBackdrop");
  const closeButton = document.querySelector("#projectDrawerClose");
  const sectionButtons = [...document.querySelectorAll("[data-project-section]")];
  const sectionPanels = [...document.querySelectorAll("[data-project-panel]")];
  const content = document.querySelector(".project-drawer-content");

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "关闭项目目录" : "打开项目目录");
    drawer.setAttribute("aria-hidden", String(!open));
    drawer.toggleAttribute("inert", !open);
    drawer.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
    backdrop.setAttribute("aria-hidden", String(!open));
    document.body.classList.toggle("project-menu-open", open);

    if (open) {
      window.requestAnimationFrame(() => closeButton.focus());
    } else if (document.activeElement !== toggle) {
      toggle.focus();
    }
  }

  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  closeButton.addEventListener("click", () => setOpen(false));
  backdrop.addEventListener("click", () => setOpen(false));

  function selectSection(section) {
    sectionButtons.forEach((button) => {
      const active = button.dataset.projectSection === section;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    sectionPanels.forEach((panel) => {
      const active = panel.dataset.projectPanel === section;
      panel.classList.toggle("active", active);
      panel.hidden = !active;
    });
    content.scrollTop = 0;
  }

  sectionButtons.forEach((button) => {
    button.addEventListener("click", () => selectSection(button.dataset.projectSection));
  });
  selectSection("background");

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      setOpen(false);
    }
  });
}

initProjectDrawer();

function initSectionNavigation() {
  const links = [...document.querySelectorAll(".top-nav a[href^='#']")];
  const jumpLinks = [
    ...document.querySelectorAll(".top-nav a[href^='#'], .signal-list a[href^='#']"),
  ];
  const header = document.querySelector(".site-header");
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);
  const workflowSection = document.querySelector("#workflow");
  if (workflowSection) sections.push(workflowSection);
  const orderedSections = [...sections].sort(
    (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top,
  );

  function setActive(sectionId) {
    links.forEach((link) => {
      const active = link.getAttribute("href") === `#${sectionId}`;
      link.classList.toggle("active", active);
      if (active) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function getSectionMarker(section) {
    return section.querySelector(".section-title") || section;
  }

  function getHeaderOffset() {
    return (header?.getBoundingClientRect().height || 64) + 24;
  }

  function scrollToSection(section, behavior = "smooth") {
    const marker = getSectionMarker(section);
    const top = window.scrollY + marker.getBoundingClientRect().top - getHeaderOffset();
    window.scrollTo({ top: Math.max(0, top), behavior });
  }

  let scrollFrame = 0;
  function updateActiveFromScroll() {
    scrollFrame = 0;
    const activationLine = getHeaderOffset() + Math.min(160, window.innerHeight * 0.24);
    let activeSection = orderedSections[0];

    orderedSections.forEach((section) => {
      if (getSectionMarker(section).getBoundingClientRect().top <= activationLine) {
        activeSection = section;
      }
    });

    const sectionId = activeSection.id === "workflow" ? "overview" : activeSection.id;
    setActive(sectionId);
  }

  function scheduleActiveUpdate() {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(updateActiveFromScroll);
  }

  jumpLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const sectionId = link.getAttribute("href").slice(1);
      const section = document.getElementById(sectionId);
      if (!section) return;

      event.preventDefault();
      window.history.pushState(null, "", `#${sectionId}`);
      setActive(sectionId);
      scrollToSection(section);
    });
  });

  window.addEventListener("scroll", scheduleActiveUpdate, { passive: true });
  window.addEventListener("resize", scheduleActiveUpdate);
  window.addEventListener("popstate", () => {
    const section = document.getElementById(window.location.hash.slice(1));
    if (section) {
      scrollToSection(section);
    } else {
      updateActiveFromScroll();
    }
  });

  const initialSection = document.getElementById(window.location.hash.slice(1));
  if (initialSection) {
    window.requestAnimationFrame(() => scrollToSection(initialSection, "auto"));
  } else {
    updateActiveFromScroll();
  }
}

initSectionNavigation();

package com.interview.copilot.common.references;

import com.interview.copilot.exception.ApiException;
import com.interview.copilot.exception.ai.ProviderFailure;

/** Only fixed messages and diagnostics constructed by the provider adapter are persisted. */
public final class ReferenceIndexFailure {
    private ReferenceIndexFailure() {}

    public static String message(String stage, Throwable error) {
        if (error instanceof ProviderFailure failure) return "向量生成失败：" + failure.getMessage();
        if (error instanceof ApiException api && "reference_limit".equals(api.code()))
            return "资料索引超出配额，请检查子片段数量和倒排记录上限后重试。";
        return switch (stage) {
            case "parse" -> "文档解析失败，请检查文件内容和分片参数。";
            case "configuration" -> "平台向量配置不可用，请检查服务是否启用及 1024 维模型配置。";
            case "embedding" -> "向量生成失败，请检查平台向量服务后重试。";
            case "prepare", "write", "publish" -> "资料索引写入或发布失败，请联系管理员检查处理日志。";
            default -> "资料处理失败，请联系管理员检查处理日志。";
        };
    }
}

package com.interview.copilot.common.operations;

public final class OperationOutcomes {
    private OperationOutcomes() {}
    public static String from(Throwable error) {
        for(Throwable cause=error;cause!=null;cause=cause.getCause()) if(cause instanceof java.util.concurrent.TimeoutException) return "timeout";
        if(error instanceof com.interview.copilot.exception.ApiException api
                && (api.status().is4xxClientError() || "PROVIDER_BUSY".equals(api.code()))) return "rejected";
        return "error";
    }
}

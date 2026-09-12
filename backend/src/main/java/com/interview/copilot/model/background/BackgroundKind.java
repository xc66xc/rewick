package com.interview.copilot.model.background;

public enum BackgroundKind {
    resumes("user_resumes", 50),
    targets("job_targets", 50),
    environments("interview_environments", 100);
    private final String table;
    private final int limit;

    BackgroundKind(String table, int limit) {
        this.table = table;
        this.limit = limit;
    }

    public String getTable() {
        return table;
    }

    public int getLimit() {
        return limit;
    }
}

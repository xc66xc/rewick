package com.interview.copilot.response.payment;

import java.util.List;

public record PackageCatalogResponse(
        boolean paymentAvailable,
        List<TimePackageResponse> packages,
        List<String> paymentMethods) {}

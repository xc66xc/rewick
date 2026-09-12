package com.interview.copilot.service.payment;

import com.interview.copilot.dto.payment.PackageInputDTO;
import com.interview.copilot.response.payment.PackageCatalogResponse;
import com.interview.copilot.response.payment.TimePackageResponse;

import java.util.List;

public interface PackageService {
    PackageCatalogResponse catalog();

    List<TimePackageResponse> list();

    TimePackageResponse save(long actorId, Long id, PackageInputDTO input);

    void archive(long actorId, long id);
}

package com.interview.copilot.service.impl.payment;

import com.interview.copilot.converter.payment.PaymentConverter;
import com.interview.copilot.dto.payment.PackageInputDTO;
import com.interview.copilot.exception.payment.PaymentErrors;
import com.interview.copilot.mapper.payment.TimePackageMapper;
import com.interview.copilot.response.payment.PackageCatalogResponse;
import com.interview.copilot.response.payment.TimePackageResponse;
import com.interview.copilot.service.audit.AuditService;
import com.interview.copilot.service.payment.PackageService;
import com.interview.copilot.service.payment.PaymentProviderService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class PackageServiceImpl implements PackageService {
    private final TimePackageMapper mapper;
    private final PaymentProviderService configs;
    private final AuditService audit;

    public PackageServiceImpl(
            TimePackageMapper mapper, PaymentProviderService configs, AuditService audit) {
        this.mapper = mapper;
        this.configs = configs;
        this.audit = audit;
    }

    public PackageCatalogResponse catalog() {
        var methods = configs.availableMethods();
        return new PackageCatalogResponse(
                !methods.isEmpty(),
                list().stream().filter(TimePackageResponse::enabled).toList(),
                methods);
    }

    public List<TimePackageResponse> list() {
        return mapper.list().stream().map(PaymentConverter::packageResponse).toList();
    }

    @Transactional
    public TimePackageResponse save(long actorId, Long id, PackageInputDTO p) {
        int price =
                Math.toIntExact(
                        (Math.multiplyExact((long) p.originalPriceCents(), p.discountBps()) + 5000)
                                / 10000);
        if (price < 1) throw PaymentErrors.invalid("折扣后金额至少为 0.01 元");
        if (id == null) id = mapper.create(p, price);
        else if (mapper.update(id, p, price) != 1)
            throw PaymentErrors.conflict("PACKAGE_CHANGED", "套餐已变更，请刷新后重试");
        audit.record(actorId, "payment.package.save", Long.toString(id));
        return PaymentConverter.packageResponse(mapper.find(id));
    }

    @Transactional
    public void archive(long actorId, long id) {
        mapper.archive(id);
        audit.record(actorId, "payment.package.archive", Long.toString(id));
    }
}

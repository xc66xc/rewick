package com.interview.copilot.service.impl.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.interview.copilot.dto.payment.AlipayConfigDTO;
import com.interview.copilot.dto.payment.PaymentResultDTO;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.response.payment.AlipayConfigResponse;
import com.interview.copilot.service.payment.AlipayConfigService;
import com.interview.copilot.service.payment.AlipayPaymentService;
import com.interview.copilot.service.payment.PaymentConfigService;
import com.interview.copilot.service.payment.WechatPaymentService;

import org.junit.jupiter.api.Test;

class PaymentProviderServiceTest {
    private final PaymentConfigService wechatConfigs = mock(PaymentConfigService.class);
    private final AlipayConfigService alipayConfigs = mock(AlipayConfigService.class);
    private final WechatPaymentService wechat = mock(WechatPaymentService.class);
    private final AlipayPaymentService alipay = mock(AlipayPaymentService.class);
    private final PaymentProviderServiceImpl service =
            new PaymentProviderServiceImpl(wechatConfigs, alipayConfigs, wechat, alipay);

    @Test
    void availableMethods_onlyAlipayAvailable_returnsAlipayWithoutFallback() {
        when(alipayConfigs.available()).thenReturn(true);

        assertThat(service.availableMethods()).containsExactly("alipay");
        verifyNoInteractions(wechat, alipay);
    }

    @Test
    void activeVersion_unknownMethod_rejectsBeforeConfigurationLookup() {
        assertThatThrownBy(() -> service.activeVersion("unknown")).isInstanceOf(ApiException.class);
        verifyNoInteractions(wechatConfigs, alipayConfigs, wechat, alipay);
    }

    @Test
    void activeVersion_disabledAlipay_doesNotUseWechat() {
        when(alipayConfigs.read())
                .thenReturn(
                        new AlipayConfigResponse(
                                4, false, true, "app", "seller", "gateway", "notify", true, true));

        assertThatThrownBy(() -> service.activeVersion("alipay")).isInstanceOf(ApiException.class);
        verifyNoInteractions(wechatConfigs, wechat);
    }

    @Test
    void validateIdentity_wechatResultForAlipayOrder_rejectsEvenWithMatchingMerchant() {
        when(alipayConfigs.forOrder(4))
                .thenReturn(
                        new AlipayConfigDTO(
                                4, false, "app", "seller", "gateway", "notify", "private",
                                "public"));
        var result =
                new PaymentResultDTO(
                        "order",
                        "seller",
                        "app",
                        "transaction",
                        "SUCCESS",
                        "CNY",
                        100,
                        java.time.Instant.now(),
                        "wechat");

        assertThatThrownBy(() -> service.validateIdentity("alipay", 4, result))
                .isInstanceOf(ApiException.class);
    }
}

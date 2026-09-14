package com.interview.copilot.service.impl.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.interview.copilot.dto.payment.ZpayConfigDTO;
import com.interview.copilot.entity.payment.ZpayConfigEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.payment.ZpayConfigMapper;
import com.interview.copilot.security.platform.PlatformSecretCipher;
import com.interview.copilot.service.audit.AuditService;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 配置密钥、版本及地址校验测试
 */
class ZpayConfigServiceImplTest {
    private final ZpayConfigMapper mapper = mock(ZpayConfigMapper.class);
    private final AuditService audit = mock(AuditService.class);
    private final PlatformSecretCipher cipher = new PlatformSecretCipher(Base64.getEncoder().encodeToString(new byte[32]));
    private final AtomicReference<ZpayConfigEntity> stored = new AtomicReference<>();
    private final ZpayConfigServiceImpl service = new ZpayConfigServiceImpl(mapper, cipher, audit);

    @Test
    void read_noSavedConfiguration_hasSelectableDefaultPaymentType() {
        assertThat(service.read().paymentType()).isEqualTo("alipay");
        assertThat(service.read().enabled()).isFalse();
    }

    @BeforeEach
    void prepare() {
        when(mapper.latest()).thenAnswer(call -> stored.get());
        doAnswer(call -> { stored.set(call.getArgument(0)); return null; }).when(mapper).insert(any());
    }

    @Test
    void save_validConfig_encryptsSecretAndPreservesBlankUpdate() {
        var saved = service.save(7, input("https://zpayz.cn/mapi.php", "merchant-test-secret"));
        assertThat(saved.hasMerchantKey()).isTrue();
        assertThat(stored.get().merchantKey()).doesNotContain("merchant-test-secret");
        assertThat(cipher.decrypt("zpay-merchant", stored.get().merchantKey())).isEqualTo("merchant-test-secret");
        String encrypted = stored.get().merchantKey();

        service.save(7, input("https://zpayz.cn/mapi.php", ""));
        assertThat(stored.get().merchantKey()).isEqualTo(encrypted);
        assertThat(service.available()).isTrue();
    }

    @Test
    void save_staleVersion_rejectsWithoutWrite() {
        stored.set(new ZpayConfigEntity(3, false, "", "", "", "", "", "", "", ""));
        assertThatThrownBy(() -> service.save(7, input("https://zpayz.cn/mapi.php", "secret")))
                .isInstanceOf(ApiException.class).hasMessageContaining("配置已变更");
        verify(mapper, never()).insert(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"http://zpayz.cn/mapi.php", "https://example.com/mapi.php",
            "https://zpayz.cn", "https://zpayz.cn/submit.php", "https://zpayz.cn/mapi.php?x=1", "https://x@zpayz.cn/mapi.php",
            "https://zpayz.cn/mapi.php#x", "https://zpayz.cn:8443/mapi.php"})
    void save_invalidGateway_rejectsWithoutWrite(String endpoint) {
        assertThatThrownBy(() -> service.save(7, input(endpoint, "secret"))).isInstanceOf(ApiException.class);
        verify(mapper, never()).insert(any());
    }

    @Test
    void forOrder_oldDisabledVersion_stillDecryptsOriginalKey() {
        when(mapper.find(12)).thenReturn(new ZpayConfigEntity(12, false, "123", "wxpay", "gateway",
                "query", "notify", "return", "", cipher.encrypt("zpay-merchant", "old-key")));
        assertThat(service.forOrder(12).merchantKey()).isEqualTo("old-key");
        assertThat(service.available()).isFalse();
    }

    @Test
    void save_enableWithoutMerchantKey_rejects() {
        assertThatThrownBy(() -> service.save(7, input("https://z-pay.cn/mapi.php", "")))
                .isInstanceOf(ApiException.class).hasMessageContaining("完整填写");
    }

    private ZpayConfigDTO input(String gateway, String key) {
        return new ZpayConfigDTO(0, true, "123", "alipay", gateway, "https://zpayz.cn/api.php",
                "https://api.junshi.icu/api/v1/payments/zpay/notify", "https://junshi.icu/payment/result", "", key);
    }
}

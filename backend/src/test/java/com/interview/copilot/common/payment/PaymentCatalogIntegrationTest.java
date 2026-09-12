package com.interview.copilot.common.payment;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;

import java.util.List;

class PaymentCatalogIntegrationTest extends PaymentHttpFixture {
    @Test
    void catalog_enabledAndDisabledPackages_exposesOnlyEnabledWithoutOpeningPayment() {
        createPackage(false);
        var plan = createPackage(true);

        var result = call(HttpMethod.GET, "/packages", aliceToken, null);

        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(result.getBody().path("paymentAvailable").asBoolean()).isFalse();
        assertThat(result.getBody().path("packages").size()).isEqualTo(1);
        assertThat(result.getBody().path("packages").get(0).path("id")).isEqualTo(plan.path("id"));
        assertThat(result.getBody().path("packages").get(0).path("priceCents").asInt()).isEqualTo(1599);
    }

    @Test
    void createOrder_missingPaymentConfiguration_cannotCreateOrCreditOrder() {
        var plan = createPackage(true);

        var result = call(HttpMethod.POST, "/payment-orders", aliceToken, orderBody(plan));

        assertThat(result.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM payment_orders", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_wallet_transactions", Long.class)).isZero();
    }

    @Test
    void adminResources_nonAdminAndAnonymous_areDenied() {
        for (String path : List.of("/admin/packages", "/admin/payment-config", "/admin/payment-orders")) {
            assertThat(call(HttpMethod.GET, path, aliceToken, null).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(call(HttpMethod.GET, path, null, null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
        for (String path : List.of("/packages", "/payment-orders")) {
            assertThat(call(HttpMethod.GET, path, null, null).getStatusCode())
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    @Test
    void update_staleVersion_doesNotOverwriteSavedPrice() {
        var plan = createPackage(true);
        var body = packageBody(true);
        body.put("version", plan.path("version").asLong());
        body.put("originalPriceCents", 2500);
        String path = "/admin/packages/" + plan.path("id").asText();
        assertThat(call(HttpMethod.PUT, path, adminToken, body).getStatusCode().is2xxSuccessful()).isTrue();
        body.put("originalPriceCents", 1);

        assertThat(call(HttpMethod.PUT, path, adminToken, body).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(call(HttpMethod.GET, "/packages", aliceToken, null).getBody()
                .path("packages").get(0).path("priceCents").asInt()).isEqualTo(2000);
    }

    @Test
    void package_invalidPricesOrDurations_areRejected() {
        for (String field : List.of("durationSeconds", "originalPriceCents", "discountBps")) {
            var body = packageBody(true);
            body.put(field, 0);
            assertThat(call(HttpMethod.POST, "/admin/packages", adminToken, body).getStatusCode())
                    .isEqualTo(HttpStatus.BAD_REQUEST);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM time_packages", Long.class)).isZero();
    }

    @Test
    void archive_package_disappearsFromCatalog() {
        var plan = createPackage(true);
        assertThat(call(HttpMethod.DELETE, "/admin/packages/" + plan.path("id").asText(), adminToken, null)
                .getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(call(HttpMethod.GET, "/packages", aliceToken, null).getBody().path("packages")).isEmpty();
    }
}

package com.interview.copilot.validation.mockinterview;

import com.fasterxml.jackson.databind.JsonNode;
import com.interview.copilot.exception.ApiException;
import org.springframework.http.HttpStatus;
import java.util.UUID;

public final class MockInput {
 private MockInput() {}
 public static ApiException error(String code,String message) {
  HttpStatus status=switch(code) {
   case "mock_not_found" -> HttpStatus.NOT_FOUND;
   case "mock_balance_insufficient" -> HttpStatus.PAYMENT_REQUIRED;
   case "mock_busy","mock_daily_limit" -> HttpStatus.TOO_MANY_REQUESTS;
   case "mock_capability_unavailable" -> HttpStatus.SERVICE_UNAVAILABLE;
   case "mock_user_unavailable" -> HttpStatus.FORBIDDEN;
   case "mock_invalid_input","mock_invalid_environment","mock_invalid_command" -> HttpStatus.BAD_REQUEST;
   case "mock_plan_failed" -> HttpStatus.BAD_GATEWAY;
   default -> HttpStatus.CONFLICT;
  };
  return new ApiException(status,code,message);
 }
 public static String uuid(JsonNode input,String field) {
  String value=input.path(field).asText();
  try { return UUID.fromString(value).toString(); }
  catch(IllegalArgumentException error) { throw new ApiException(HttpStatus.BAD_REQUEST,"mock_invalid_input",field+" 必须是 UUID。"); }
 }
 public static int range(JsonNode input,String field,int min,int max) {
  JsonNode value=input.path(field);
  if(!value.isIntegralNumber() || value.asInt()<min || value.asInt()>max)
   throw new ApiException(HttpStatus.BAD_REQUEST,"mock_invalid_input",field+" 超出允许范围。");
  return value.asInt();
 }
}

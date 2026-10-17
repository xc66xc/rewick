package com.interview.copilot.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

public final class MockJson {
 private MockJson() {}
 public static JsonNode parse(ObjectMapper json,String text) {
  try { return json.readTree(text); }
  catch(JsonProcessingException error) { throw new IllegalStateException("Invalid persisted mock JSON",error); }
 }
 public static String hash(JsonNode node) {
  try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical(node).toString().getBytes(StandardCharsets.UTF_8))); }
  catch(NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
 }
 private static JsonNode canonical(JsonNode value) {
  if(value.isObject()) {
   var result=com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.objectNode();
   java.util.List<String> names=new java.util.ArrayList<>();value.fieldNames().forEachRemaining(names::add);names.sort(String::compareTo);
   names.forEach(name->result.set(name,canonical(value.get(name))));return result;
  }
  if(value.isArray()) {var result=com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();value.forEach(item->result.add(canonical(item)));return result;}
  return value;
 }
}

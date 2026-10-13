package com.interview.copilot.security.operations;

import com.interview.copilot.common.ApiErrorWriter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;

@Component
public final class OperationsPayloadFilter extends OncePerRequestFilter {
    private static final int LIMIT=256*1024;
    private final ApiErrorWriter errors;
    public OperationsPayloadFilter(ApiErrorWriter errors) {this.errors=errors;}
    @Override protected boolean shouldNotFilter(HttpServletRequest request) {return !"/api/v1/telemetry/operations".equals(request.getRequestURI());}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws IOException,ServletException {
        if(request.getContentLengthLong()>LIMIT) {errors.write(response,413,"OPERATIONS_PAYLOAD_TOO_LARGE","观测批次不能超过 256KB。");return;}
        chain.doFilter(new HttpServletRequestWrapper(request) {
            private ServletInputStream limited;
            @Override public ServletInputStream getInputStream() throws IOException {
                if(limited!=null) return limited;
                ServletInputStream original=super.getInputStream();
                limited=new ServletInputStream() {
                    private int count;
                    private void check(int size) throws IOException {if(size>0 && (count+=size)>LIMIT) throw new IOException("Operations payload limit exceeded");}
                    @Override public int read() throws IOException {int value=original.read();check(value<0?0:1);return value;}
                    @Override public int read(byte[] bytes,int offset,int size) throws IOException {int read=original.read(bytes,offset,Math.min(size,LIMIT-count+1));check(read);return read;}
                    @Override public boolean isFinished() {return original.isFinished();}
                    @Override public boolean isReady() {return original.isReady();}
                    @Override public void setReadListener(ReadListener listener) {original.setReadListener(listener);}
                };return limited;
            }
        },response);
    }
}

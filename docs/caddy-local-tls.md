# Local Caddy TLS proxy

Use this exact Caddyfile with the plugin's default loopback port. `tls internal` is suitable for a trusted local certificate after installing Caddy's local CA; replace it with a trusted certificate for a network deployment.

```caddyfile
https://localhost {
  tls internal

  reverse_proxy 127.0.0.1:8765 {
    header_up Host 127.0.0.1:8765
    header_up Origin http://127.0.0.1:8765
    header_down Access-Control-Allow-Origin https://localhost
  }
}
```

The upstream `Host` and `Origin` are the exact loopback values validated by the plugin. The proxy's explicit downstream CORS rewrite makes the browser's original `https://localhost` origin usable; it is not a forwarded-header bypass. Forwarded headers remain untrusted, and every request still needs the bearer token. If the plugin port changes, update both the plugin setting and this upstream address.

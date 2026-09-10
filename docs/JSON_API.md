# JSON API

The API is read-only and versioned at `/api/v1`.

| Request                      | Result                              |
| ---------------------------- | ----------------------------------- |
| `GET /api/v1`                | Supported dataset names             |
| `GET /api/v1/snapshot`       | Current projection of every dataset |
| `GET /api/v1/data/{dataset}` | Current projection of one dataset   |

The response for a dataset includes `available`, `partial`, and `items`. A dataset is explicitly partial until its corresponding poi state is present. Only documented scalar fields and scalar arrays are copied; Redux, config, cookies, game credentials, and arbitrary properties are never returned.

Use a trusted TLS proxy for remote access. The concrete local configuration in [caddy-local-tls.md](caddy-local-tls.md) listens at `https://localhost`, connects to `127.0.0.1:8765`, and explicitly sends `Host: 127.0.0.1:8765` and `Origin: http://127.0.0.1:8765` upstream. It also maps the response's CORS origin back to `https://localhost`, so browser requests use the same validated loopback tuple. Install/trust Caddy's local certificate (or replace `tls internal` with a trusted certificate), keep the plugin on its documented port, and retain bearer authentication. Forwarded headers are not trusted and do not relax validation. Do not put the bearer token in a URL.

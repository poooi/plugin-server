# JSON API

The API is read-only and versioned at `/api/v1`.

| Request                      | Result                              |
| ---------------------------- | ----------------------------------- |
| `GET /api/v1`                | Supported dataset names             |
| `GET /api/v1/snapshot`       | Current projection of every dataset |
| `GET /api/v1/data/{dataset}` | Current projection of one dataset   |

The response for a dataset includes `available`, `partial`, and `items`. A dataset is explicitly partial until its corresponding poi state is present. Only documented scalar fields and scalar arrays are copied; Redux, config, cookies, game credentials, and arbitrary properties are never returned.

Use a trusted TLS tunnel or reverse proxy for remote access. It must connect to the loopback listener and present an allowed `Host` and browser `Origin` to the plugin. Forwarded headers are not trusted and do not relax validation. Do not put the bearer token in a URL.

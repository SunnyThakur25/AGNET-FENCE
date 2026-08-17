# Native MCP Gateway Research Notes

**Research date:** August 17, 2026

## Authoritative protocol findings

The Model Context Protocol uses JSON-RPC 2.0 messages between hosts, clients, and servers. A server exposes tools through the `tools` capability; discovery uses `tools/list`, and invocation uses `tools/call` with a tool name and JSON arguments.[1] Tool metadata and annotations from an upstream server must be treated as untrusted unless that server is trusted. The protocol guidance also calls for input validation, access controls, rate limiting, output sanitization, user confirmation on sensitive operations, timeouts, and tool-use audit logs.[1]

For HTTP transports that support MCP authorization, the authorization specification describes OAuth-based resource-server discovery and least-privilege scopes. It distinguishes HTTP transport from STDIO transport, which should obtain credentials from the environment. It also requires protected-resource metadata support for conforming authorization-capable MCP servers and recommends a `WWW-Authenticate` challenge with scope guidance when authentication is required.[2]

## AgentFence design consequences

| Protocol finding | AgentFence gateway control |
|---|---|
| Upstream tools are server-defined and may be untrusted. | Store discovered tool schemas as a reviewable catalog; do not permit invocation until an organization administrator trusts the server and enables individual tools. |
| Tools use `tools/list` and `tools/call`. | Support server-side discovery and JSON-RPC forwarding only after tenant, agent, policy, Data Guard, and approval checks. |
| Tool inputs and outputs require validation and sanitization. | Apply Data Guard to arguments before policy evaluation and forwarding; return a redacted, bounded result and retain only privacy-safe audit metadata. |
| Sensitive actions require human control. | Reuse the AgentFence approval-required policy outcome before upstream invocation. |
| HTTP and STDIO have different credential handling. | Initial scope supports HTTPS remote MCP servers only. STDIO, OAuth authorization-code exchanges, and upstream dynamic registration remain explicit future work. |

## References

[1]: https://modelcontextprotocol.io/specification/2025-06-18/server/tools "Model Context Protocol: Tools"
[2]: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization "Model Context Protocol: Authorization"
[3]: https://modelcontextprotocol.io/specification/2026-07-28 "Model Context Protocol Specification"

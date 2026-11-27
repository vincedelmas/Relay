# Changelog

## [0.2.0](https://github.com/vincedelmas/Relay/compare/v0.1.0...v0.2.0) (2026-11-27)


### Features

* auto-sync stale provider tools on MCP discovery ([3453da3](https://github.com/vincedelmas/Relay/commit/3453da388b8d3f947b2d54d4203b6f804b973a08))
* implement Relay MCP gateway, OAuth 2.1, QuickJS code mode, and dashboard ([50e496f](https://github.com/vincedelmas/Relay/commit/50e496f4575b9eae98519ee8ab48d2ff2908a641))
* switch single-owner login to Google OAuth locked by OWNER_EMAIL ([8ae6b50](https://github.com/vincedelmas/Relay/commit/8ae6b50f23592d581a71cc7447fac5bdea4eec43))
* **ui:** redesign dark theme, dashboard shell, and interactive workflows ([8e9edd4](https://github.com/vincedelmas/Relay/commit/8e9edd4e4aa59fc2fd94ba55efea7cc54efe779d))


### Bug Fixes

* decouple MCP client access from browser session and set Famiglia preset URL ([0c93d7a](https://github.com/vincedelmas/Relay/commit/0c93d7a749a89134f85ae79aa0cea81a04eb988f))
* harden OAuth, CIMD, FTS5 filtering, MCP payloads, and atomic client policy edits ([c69c00b](https://github.com/vincedelmas/Relay/commit/c69c00b88ea35c8b491d9b45e10169d4baae4e74))
* harden tool resolution, sync commit guards, Bun idleTimeout, consent order, and config merges ([167fea6](https://github.com/vincedelmas/Relay/commit/167fea68276e75850599133c767575a9ffbb907b))
* terminate stateful upstream MCP sessions and sort synced tools deterministically ([fdb6d60](https://github.com/vincedelmas/Relay/commit/fdb6d6043d41daddc3437d008882da58d778c702))
* use data-orientation selectors in Tabs and Separator components ([2443365](https://github.com/vincedelmas/Relay/commit/2443365c9f1eb8f06f225fb9814b7206b4e7614f))


### Code Refactoring

* extract react-query hooks, centralize gateway types, and align import/prop conventions ([29ebccd](https://github.com/vincedelmas/Relay/commit/29ebccd2b8e114d78791d0367062c019d21b0bd5))
* replace Code Mode with Classic MCP + execute sandbox and generic Steam API tool ([a06c956](https://github.com/vincedelmas/Relay/commit/a06c956209a202e81415bfeeca5835d8073e1aa9))
* trim scaffold boilerplate and switch to bun test ([8ebb1d5](https://github.com/vincedelmas/Relay/commit/8ebb1d5c114d0449ecf0c6387a1496f2eaf50718))

# Diagram Assets

This folder stores architecture, runtime, and delivery workflow diagram sources.

## Diagram Catalog

1. System design + operations workflow
- Source: [openvpn-design-workflow.mmd](openvpn-design-workflow.mmd)
- Rendered reference: [openvpn-design-workflow.svg](openvpn-design-workflow.svg)

2. CI/CD deployment sequence (GitHub Actions + OIDC + SSM)
- Source: [openvpn-cicd-ssm-sequence.mmd](openvpn-cicd-ssm-sequence.mmd)

3. Runtime data flow (OpenVPN -> status/device-hints -> portal -> history)
- Source: [openvpn-runtime-dataflow.mmd](openvpn-runtime-dataflow.mmd)

## Update Workflow

1. Edit Mermaid source files in this folder.
2. Validate and preview in Mermaid plugin.
3. Export/update SVG assets when a stable rendered reference is needed.
4. Keep [../README.md](../README.md) and [../../README.md](../../README.md) diagram links in sync.

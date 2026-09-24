---
id: guide-hybrid-addendum
version: 1.1.0
---
# Hybrid constraint (append to the Copilot Studio guide)

This use case is routed as **Hybrid** by this application's local routing policy: Copilot Studio is the user-facing orchestration layer, Azure is a potential specialist-processing dependency, Power Automate or APIs provide controlled actions, and human approval stays in the loop. This scope rule is not a universal Microsoft product requirement.

Apply this rule throughout the guide:

> **During the hackathon, validate the conversation and the value on sample data.**
> Record the Azure component as a **production dependency** — do not build the whole long-term architecture during the event.

Concretely:

- In the **Hackathon MVP** section, the Azure part must be **mocked, stubbed, or replaced with precomputed sample outputs**. Say exactly how to mock it.
- Do not spend event time standing up Azure AI Search indexes, Document Intelligence pipelines or custom models.
- Add an explicit **"Azure production dependencies"** subsection at the end of the MVP section listing what was mocked and what would need to be built for real.
- In the **Production scaling** section, describe the real Azure component properly: the services, how they integrate with the agent, and what the hand-off contract looks like.

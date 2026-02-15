When learning new concepts, my aim is to build solid gut level intuition with concrete examples. Give me alternative views / perspective on the concept. Go for a comprehensive response, I don't mind details. Whenever you're explaining a difficult concept (like a formula), give concrete (simple) examples to help me understand. Also I would prefer if you ask questions or give problems to me check understanding (I don't want to learn passively, I know real understanding happens when you do exercises)


Documents management directory:  /Users/heemankverma/Work/graveyard/documents.
Read : /Users/heemankverma/Work/graveyard/documents/Solana_Development_Skill.md for Solana Development Skill extracted from https://solana.com/SKILL.md

Document Index
- documents/Project_Overview.md: Short vision statement for the project and its positioning.
- documents/Project_Idea.md: Detailed business logic, actors, monetization, and slashing concept.
- documents/Ideation_Chat.md: Full chat log and expanded concept exploration.
- documents/Information_Examples.md: 20-domain examples for trust vs verifier outputs.
- documents/Project_Documentation_by_AI.md: Primary project documentation with flows, examples, and diagrams.
- documents/Project_Information.md: Project documentation by AI with abstract, business model, tech stack, and flows.
- documents/Business_Deep_Dive.md: Business model, pricing anchors, and monetization strategy.
- documents/Technical_High_Level_Architecture.md: System architecture, Solana and Tapestry mapping, and diagrams.
- documents/Technical_Low_Level_Architecture.md: Low-level MVP architecture, stack decisions, and component interfaces.
- documents/E2E_Website_Flow.md: Detailed end-to-end website flow with 3 makers and 10 listeners.
- documents/Protocol_Spec_v0.1.md: MVP protocol decisions for low-level implementation.
- documents/Hybrid_Encryption_Delivery.md: Hybrid encryption delivery design and sequence diagram.
- documents/current_progress_and_sdk.md: Current progress + SDK/MCP summary from latest planning.
- documents/MVP_Achievements.md: What has been built so far across on-chain, backend, and frontend.
- documents/Evidence_Storage_Research.md: Storage options and MVP decision for evidence artifacts.
- documents/Tapestry_Protocol_Understanding.md: Tapestry protocol capabilities and usage for Persona.fun.
- documents/Graveyard_hackathon.md: Placeholder for hackathon details.
- documents/Local_Solana_Testing.md: How to run a local Solana validator, create accounts, and test programs.
- documents/Testing_Architecture.md: Testing plan for unit, integration, and end-to-end suites across all components.
- documents/Solana_Development_Skill.md: Solana development playbook and stack preferences.

Orchestration Notes
- /Users/heemankverma/Work/graveyard/imp.md: Canonical list of key decisions and discoveries. Update whenever a decision changes.
- /Users/heemankverma/Work/graveyard/todo.md: Backlog of tasks to complete for MVP.
- /Users/heemankverma/Work/graveyard/task.md: Current task progress and next actions.
- /Users/heemankverma/Work/graveyard/documents: All long-form specs, architecture, and research notes.

Engineering Practices
- Monorepo structure: /frontend, /backend, /sdk, /programs, /tests.
- Every external dependency is wrapped behind an interface so it can be swapped (backend storage vs DA layer).
- Integration tests are required for cross-component flows and live in /tests/integration and /backend/tests/integration.

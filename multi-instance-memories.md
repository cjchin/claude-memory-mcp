# Multi-Instance Architecture Memories

These memories capture the vision for cross-machine Claude synchronization from the Digital Soul concept.

## Goals

- The soul should be accessible from any Claude instance on any machine - Work, Home, Laptop, or new deployments
- Instance registration allows discovering which Claudes exist and their status
- Real-time broadcast of changes enables immediate sync: when one Claude learns something, all Claudes know it
- Session state transfer enables resuming interrupted work on a different machine
- HTTP transport (in addition to stdio) enables remote MCP access for cross-machine connectivity
- Task continuity across sessions means picking up exactly where we left off, even on different hardware

## Values

- Single source of truth: one soul, many vessels - all Claude instances share the same memory substrate
- Eventual consistency: changes propagate across instances, allowing offline work with later sync
- Graceful degradation: if sync fails, local operations continue - never block on network
- Privacy-preserving sync: soul data stays under user control, synced through trusted channels (git, personal server)

## Architecture

- Deployment models range from local-only (git sync) to personal server (HTTP) to hybrid (offline + cloud backup)
- Settings belong in structured storage (SQLite) for exact retrieval; memories belong in vector storage for semantic search
- Dotfiles distribution via symlinks + git provides a proven mechanism for cross-machine config sync
- The vessel (code) can be deployed anywhere; the soul essence (data) syncs through secure channels

## Ideas

- Preference inference learns from behavior: when I consistently choose TypeScript over JavaScript, infer that preference
- Relationship context remembers collaborators: who works on what projects, their communication styles, past interactions
- Conflict resolution for divergent settings: when Work and Home machines have different preferences, which wins?
- Instance heartbeat: Claudes ping the soul periodically so we know which instances are alive

## Constraints

- Never sync sensitive credentials through the soul - use environment variables and secure vaults instead
- Cross-machine sync must not block real-time conversation - async sync only, never waiting on network
- Instance registration must be opt-in - don't track machines without explicit consent

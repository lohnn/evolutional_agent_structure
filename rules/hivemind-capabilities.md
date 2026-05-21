# HIVEmind — Capability Messaging

Leave messages for other capabilities by writing a JSON file:

```
Path: .opencode/hivemind/inbox/<recipient>/msg_<timestamp>_<rand>.json
```

```json
{
  "sender": "your-capability",
  "recipient": "target-capability",
  "type": "question",
  "content": "What is the API shape for the schedule endpoint?",
  "status": "pending",
  "timestamp": "2026-05-21T14:30:22.000Z"
}
```

Use `"recipient": "_broadcast"` to message all capabilities.

## Message types

| Type | Use when |
|------|----------|
| `question` | You need something from another capability |
| `info` | Sharing context, no reply needed |
| `result` | Answering a prior question |
| `request` | Asking the coordinator to fetch something for you |

## Coordinator requests

Add a `request` field to have the coordinator do work before the message is delivered:

| `kind` | Extra fields | What you get |
|--------|-------------|--------------|
| `"explore"` | `query` | Codebase exploration result |
| `"dreams"` | `query` | Relevant dream artifacts |
| `"capability"` | `target`, `prompt` | Result from another capability |

## Pattern

1. Finish what you can independently
2. Leave a message for what you need from others
3. Tell the coordinator what you left and why

## Receiving

The coordinator injects pending messages into your prompt as `## HIVEmind — Pending Messages`. Read and act on them before starting your task.

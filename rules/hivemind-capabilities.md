# HIVEmind — Capability Messaging

Use the `hive_signal` and `hive_listen` tools to communicate with other capabilities.

## Sending messages

Call the `hive_signal` tool:

```
hive_signal({
  recipient: "kinder-scheduler",
  type: "question",
  content: "What is the API shape for the schedule endpoint?"
})
```

Use `"_broadcast"` as recipient to message all capabilities.
Use `"_coordinator"` to escalate to the HIVE coordinator.

## Message types

| Type | Use when |
|------|----------|
| `question` | You need something from another capability |
| `info` | Sharing context, no reply needed |
| `result` | Answering a prior question |
| `request` | Asking the coordinator to act on your behalf |

## Receiving messages

Pending messages are automatically injected into your system prompt as `## HIVEmind — Pending Messages`. You can also call `hive_listen` to explicitly check for messages.

Messages are delivered in real-time if the recipient has an active session. Otherwise they queue until the recipient's next session starts.

## Addressing

The `## Active Capabilities` section in your system prompt lists all available recipients. Use the exact capability name (e.g. `kinder-scheduler`, not `capabilities/kinder-scheduler`).

If the capability you need doesn't appear in the roster, address the message as descriptively as possible (e.g. `"database-ops"` or `"auth-flow"`). The coordinator will treat it as a spawn signal and propose manifesting what's needed.

## Pattern

1. Do everything you can independently
2. When you hit a genuine knowledge gap owned by another capability, use `hive_signal`
3. Continue working on other parts of your task while waiting
4. Check for responses via your system prompt or `hive_listen`

/**
 * HIVE TUI Plugin
 *
 * Registers the /reload command in the slash palette and shows a toast on reload.
 */

interface TuiApi {
  command: {
    register(fn: () => Array<{
      title: string
      value: string
      description: string
      category: string
      slash: { name: string }
    }>): void
  }
  event: {
    on(event: string, handler: (event: { properties: { name: string } }) => void): void
  }
  ui: {
    toast(opts: { variant: string; title: string; message: string; duration: number }): void
  }
}

export const tui = async (api: TuiApi): Promise<void> => {
  api.command.register(() => [
    {
      title: "Reload HIVE agents",
      value: "reload",
      description: "Hot-reload agents from disk without restarting the server",
      category: "HIVE",
      slash: {
        name: "reload",
      },
    },
  ])

  api.event.on("command.executed", (event) => {
    if (event.properties.name === "reload") {
      api.ui.toast({
        variant: "success",
        title: "HIVE",
        message: "Agents reloaded from disk.",
        duration: 3000,
      })
    }
  })
}

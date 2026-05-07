/**
 * HIVE TUI Plugin
 *
 * Registers the /reload command in the slash palette and shows a toast on reload.
 */

export const tui = async (api) => {
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
  ]);

  api.event.on("command.executed", (event) => {
    if (event.properties.name === "reload") {
      api.ui.toast({
        variant: "success",
        title: "HIVE",
        message: "Agents reloaded from disk.",
        duration: 3000,
      });
    }
  });
};

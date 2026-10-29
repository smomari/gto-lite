/// <reference lib="webworker" />
import { runShowdownHelper, type ShowdownHelperSetup } from "./parallelShowdown";

// Created by workerClient.ts on the main thread and connected to the solver
// worker through a MessageChannel port; from the first setup message on it
// only computes its slice of each iteration's showdown batch.
self.onmessage = (event: MessageEvent) => {
  const [port] = event.ports;
  port.onmessage = (setupEvent: MessageEvent<ShowdownHelperSetup>) => runShowdownHelper(setupEvent.data);
};

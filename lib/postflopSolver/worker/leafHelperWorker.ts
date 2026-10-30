/// <reference lib="webworker" />
import { runLeafHelper, type LeafHelperSetup } from "./leafHelpers";
import { loadWebSolverModule } from "../wasm/loadWeb";

// Created by workerClient.ts on the main thread for a lookahead solve and
// connected to the solver worker through a MessageChannel port; from the setup
// message on it only runs its share of the solve's leaves (see leafHelpers.ts).
self.onmessage = (event: MessageEvent) => {
  const [port] = event.ports;
  port.onmessage = async (setupEvent: MessageEvent<LeafHelperSetup>) => {
    runLeafHelper(setupEvent.data, await loadWebSolverModule());
  };
};

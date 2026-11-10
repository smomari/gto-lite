import { initBotId } from "botid/client/core";

// Attaches BotID's challenge to the requests that spend AI explanations.
initBotId({ protect: [{ path: "/api/explain", method: "POST" }] });

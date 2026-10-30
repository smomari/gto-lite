/// <reference lib="webworker" />
// One pthread pool worker of the threaded solver core (see loadWeb.ts): the
// module notices it runs in a worker named "em-pthread" and starts as a pool
// thread instead of a main instance.
import "./solver.web-threads.mjs";

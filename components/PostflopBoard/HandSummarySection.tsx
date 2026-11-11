"use client";

import type { ReactNode } from "react";
import { narrowRangeAlongPath } from "@/lib/postflopSolver/rangeNarrowing";
import { rakeablePot } from "@/lib/postflopSolver/potState";
import { rakeForPot, type RakeStructure } from "@/lib/solveEngine/rake";
import { buildHandSummary, type ExplainContext } from "@/lib/explain/buildHandSummary";
import { ExplainPanel } from "@/components/Explain/ExplainPanel";
import type { SerializedTerminalNode } from "@/types/postflopSolver";
import { PostflopHandSummary, type HandOutcome } from "./PostflopHandSummary";
import { streetStartPot, type StreetStage } from "./streetStages";
import { useMessages } from "@/lib/i18n/locale";

interface HandSummarySectionProps {
  streets: StreetStage[];
  /** The stage the hand ended on. */
  stageIndex: number;
  node: SerializedTerminalNode;
  allIn: boolean;
  preflopPot: number;
  heroLabel: string;
  villainLabel: string;
  rake: RakeStructure;
  actions: ReactNode;
  /** Offers an AI explanation of the hand when given. */
  explain?: ExplainContext;
}

/** The finished hand: each street's line, the pot and rake, and both ranges from the flop to the end. */
export function HandSummarySection({ streets, stageIndex, node, allIn, preflopPot, heroLabel, villainLabel, rake, actions, explain }: HandSummarySectionProps) {
  const t = useMessages();
  const firstStage = streets[0].state;
  const stage = streets[stageIndex];
  if (firstStage.kind !== "done" || stage.state.kind !== "done") return null;
  const { result } = stage.state;
  const seatLabel = (actor: "P1" | "P2") => (actor === "P1" ? heroLabel : villainLabel);
  const rakeBb = rakeForPot(rakeablePot(node.potBb - node.committed.P1 - node.committed.P2, node.committed), rake);
  const played = streets.slice(0, stageIndex + 1);
  /** Which line this is, so a different one starts a fresh explanation. */
  const lineKey = played.map((street) => `${street.board.join("")}:${street.path.map((step) => step.actionIndex).join(".")}`).join("|");
  const buildSummary = () =>
    buildHandSummary({
      ...explain!,
      streets: played.flatMap((street) =>
        street.state.kind === "done"
          ? [{ board: street.board, effectiveStackAtStart: street.effectiveStackAtStart, result: street.state.result, path: street.path }]
          : [],
      ),
      ending: { node, allIn, rakeBb },
    });
  const outcome: HandOutcome =
    node.type === "terminal-fold"
      ? { kind: "fold", winnerLabel: seatLabel(node.winner!) }
      : allIn
        ? { kind: "allin", note: t.postflop.allInNote(node.potBb.toFixed(1)) }
        : { kind: "showdown" };
  return (
    <PostflopHandSummary
      outcome={outcome}
      board={stage.board}
      potBb={node.potBb}
      rakeBb={rakeBb}
      equity={node.type === "terminal-showdown" ? node.checkdownEquity : undefined}
      streets={played.map((street, k) => ({
        label: t.streets[street.streetLabel],
        potBb: k === stageIndex ? node.potBb : streetStartPot(streets, k + 1, preflopPot),
        actions: street.path.map((step) => `${seatLabel(step.node.actor)} ${t.action(step.node.actions[step.actionIndex].label)}`),
      }))}
      hero={{ label: heroLabel, start: firstStage.result.heroRange, end: narrowRangeAlongPath(result.heroRange, "P1", stage.path) }}
      villain={{ label: villainLabel, start: firstStage.result.villainRange, end: narrowRangeAlongPath(result.villainRange, "P2", stage.path) }}
      actions={actions}
      explanation={explain && <ExplainPanel key={lineKey} buildSummary={buildSummary} />}
    />
  );
}

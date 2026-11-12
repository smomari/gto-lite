"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { actionToken, findActionByToken, type PostflopLine } from "@/lib/share/spotLink";
import type { SerializedDecisionAction } from "@/types/postflopSolver";
import type { StreetStage } from "./streetStages";

/** The board and actions the streets hold now, as a link writes them. */
export function lineOf(streets: StreetStage[]): PostflopLine {
  const dealt = streets.filter((stage) => stage.board.length > 0);
  return {
    board: dealt.length > 0 ? dealt[dealt.length - 1].board : [],
    streets: dealt.map((stage) => stage.path.map((step) => actionToken(step.node.actions[step.actionIndex]))),
  };
}

/** The cards a line deals on stage `stageIndex`: the flop's three, then one each. */
function cardsFor(line: PostflopLine, stageIndex: number): string[] {
  return stageIndex === 0 ? line.board.slice(0, 3) : line.board.slice(stageIndex + 2, stageIndex + 3);
}

type Step =
  | { kind: "deal"; stageIndex: number; cards: string[] }
  | { kind: "act"; stageIndex: number; action: SerializedDecisionAction }
  | { kind: "wait" | "done" | "stopped" };

/**
 * What `line` asks for next with the streets as they stand: a street's cards,
 * one of its actions, or nothing while a solve runs. It is done when the line
 * runs out, and stopped at an action the solved street doesn't offer or a
 * solve that failed.
 */
export function nextStep(streets: StreetStage[], line: PostflopLine): Step {
  const stageIndex = streets.length - 1;
  const stage = streets[stageIndex];
  if (stage.state.kind === "solving") return { kind: "wait" };
  if (stage.state.kind === "error") return { kind: "stopped" };
  if (stage.state.kind === "idle") {
    const cards = cardsFor(line, stageIndex);
    return cards.length > 0 ? { kind: "deal", stageIndex, cards } : { kind: "done" };
  }
  // A street closed by its last action has already opened the next one, so a solved last stage sits at a decision or the hand's end.
  if (stage.currentNode?.type !== "decision") return { kind: "done" };
  const token = line.streets[stageIndex]?.[stage.path.length];
  if (!token) return { kind: "done" };
  const action = findActionByToken(stage.currentNode.actions, token);
  return action ? { kind: "act", stageIndex, action } : { kind: "stopped" };
}

interface Play {
  confirmBoard: (stageIndex: number, cards: string[]) => void;
  navigate: (stageIndex: number, action: SerializedDecisionAction) => void;
}

/**
 * Plays a shared link's postflop line back: deals each street's cards, waits
 * for its solve, then takes the line's actions one at a time. `cancel` hands
 * the hand back for good the moment the user acts on their own; every handler
 * of theirs calls it, which is also what keeps a finished replay from starting
 * again when they go back a street.
 */
export function useLineRestore(streets: StreetStage[], initialLine: PostflopLine | undefined, play: Play) {
  // Only the line the panel was opened with is replayed; later ones are the user's own.
  const [line] = useState(initialLine);
  const [cancelled, setCancelled] = useState(false);
  const step: Step = !line || cancelled ? { kind: "done" } : nextStep(streets, line);

  // Each step changes the streets, which is what asks for the next one. React's
  // development double-mount cancels the first deal's solve and runs this again,
  // which deals once more: taking a step twice is harmless, skipping one is not.
  const take = useEffectEvent(() => {
    if (step.kind === "deal") play.confirmBoard(step.stageIndex, step.cards);
    else if (step.kind === "act") play.navigate(step.stageIndex, step.action);
  });

  useEffect(() => {
    take();
  }, [streets]);

  return {
    restoring: step.kind === "deal" || step.kind === "act" || step.kind === "wait",
    stopped: step.kind === "stopped",
    cancel: () => setCancelled(true),
  };
}
